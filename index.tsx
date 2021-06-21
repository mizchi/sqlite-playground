import initSqlJs, { SqlJsStatic, Database } from "sql.js";
import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { useMonacoEditor } from "use-monaco";
import * as data from "./data";
// @ts-ignore
import jsonurl from "json-url";

const codec = jsonurl("lzw");

const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

let SQL: SqlJsStatic;

const STORAGE_KEY = "sqlplg:state";

type PersistState = {
  code: string;
  format: boolean;
  autorun: boolean;
  refresh: boolean;
};

function getLastState(): PersistState | undefined {
  const ret = localStorage[STORAGE_KEY];
  if (ret == null || ret === "undefined") {
    return undefined;
  }
  return JSON.parse(ret) as PersistState;
}

function saveState(state: PersistState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function ensureSqlStatic(): Promise<SqlJsStatic> {
  return (SQL ??= await initSqlJs({
    locateFile: (file) => {
      return `/${file}`;
    },
  }));
}

async function createDb(options?: any) {
  await ensureSqlStatic();
  return new SQL.Database(options);
}

let currentDb: Database | null;
async function runQuery(query: string, options: { refresh: boolean }) {
  if (options.refresh || currentDb == null) {
    currentDb?.close();
    currentDb = await createDb();
  }
  return currentDb.exec(query);
}

let tid: any = null;
let preview_tid: any = null;

function Editor(props: { initialState: PersistState }) {
  const [previewValue, setPreviewValue] = useState<null | string>(null);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [code, setCode] = useState<string>(props.initialState.code);
  const [isFormat, setIsFormat] = useState<boolean>(props.initialState.format);
  const [resetOnRun, setResetOnRun] = useState<boolean>(
    props.initialState.refresh
  );
  const [autorun, setAutorun] = useState<boolean>(props.initialState.autorun);

  const { containerRef, monaco, editor } = useMonacoEditor({
    language: "sql",
    theme: isDark ? "vs-dark" : "default",
    defaultContents: props.initialState.code,
    options: {
      fontSize: 16,
      minimap: {
        enabled: false,
      },
    },
    modelOptions: {
      indentSize: 2,
      tabSize: 2,
    },
  });

  const runPreview = useCallback(async () => {
    if (editor == null) return;
    try {
      const res = await runQuery(code, { refresh: resetOnRun });
      if (isFormat) {
        const formatted = res.map((q) =>
          q.values.map((v) => {
            return q.columns.reduce((acc, key, index) => {
              return { ...acc, [key]: v[index] };
            }, {});
          })
        );
        setPreviewValue(JSON.stringify(formatted, null, 2));
      } else {
        setPreviewValue(JSON.stringify(res, null, 2));
      }
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err.message as string);
    }
  }, [editor, code, isFormat, resetOnRun]);

  useEffect(() => {
    if (monaco == null) return;
    if (editor == null) return;

    editor.addAction({
      id: "run",
      label: "run",
      run: runPreview,
      keybindings: [monaco.KeyMod.WinCtrl | monaco.KeyCode.KEY_R],
    });
    editor.focus();
    const d = editor.onDidChangeModelContent((_editor) => {
      setCode(editor.getValue());
    });
    // runPreview();
    return () => d.dispose();
  }, [editor, monaco, runPreview]);

  // preview autorun
  useEffect(() => {
    if (!autorun) return;
    if (preview_tid) clearTimeout(preview_tid);
    preview_tid = setTimeout(() => {
      runPreview();
      tid = null;
    }, 300);
  }, [code, runPreview]);

  useEffect(() => {
    // persist
    if (tid) clearTimeout(tid);
    tid = setTimeout(() => {
      saveState({
        code,
        autorun,
        format: isFormat,
        refresh: resetOnRun,
      });
      tid = null;
    }, 300);
  }, [code, autorun, isFormat, resetOnRun]);

  const onClickCopy = useCallback(() => {
    // run
    codec.compress({ code }).then((minified: string) => {
      navigator.clipboard.writeText(
        `${location.protocol}//${location.host}/#${minified}`
      );
    });
  }, []);

  return (
    <div style={{ display: "flex" }}>
      {/* <div ref={containerRef} style={{ height: "100vh", width: "50vw" }} /> */}
      <div ref={containerRef} style={{ height: "100vh", width: "50vw" }}></div>

      <div style={{ height: "100vh", width: "50vw" }}>
        <div style={{ paddingLeft: 10 }}>
          <div>
            <button onClick={runPreview}>Run(Ctrl-R)</button>
            <button onClick={onClickCopy}>Copy share url</button>
            &nbsp; |
            <input
              type="checkbox"
              checked={isFormat}
              onChange={(ev) => {
                setIsFormat(ev.target.checked);
                runPreview();
              }}
            />
            Format &nbsp; |
            <input
              type="checkbox"
              checked={resetOnRun}
              onChange={(ev) => {
                setResetOnRun(ev.target.checked);
              }}
            />
            Reset on Run |
            <input
              type="checkbox"
              checked={autorun}
              onChange={(ev) => {
                setAutorun(ev.target.checked);
              }}
            />
            Autorun | Load &nbsp;
            <select
              onChange={(ev) => {
                const key = ev.target.value;
                // @ts-ignore
                const val = data[key];
                if (val) {
                  // setCode(val);
                  editor.setValue(val);
                }
              }}
            >
              {Object.keys(data).map((t) => {
                return (
                  <option key={t} value={t}>
                    {t}
                  </option>
                );
              })}
            </select>
            &nbsp; |
            <a href="https://github.com/mizchi/sqlite-playground">GitHub</a>
          </div>

          {errorMessage && <div style={{ color: "red" }}>{errorMessage}</div>}
          <pre>
            <code style={{ fontFamily: "Menlo" }}>{previewValue}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

async function main() {
  if (location.hash) {
    try {
      const decompressed = await codec.decompress(location.hash);
      const initialState: PersistState = {
        code: decompressed.code,
        autorun: false,
        refresh: true,
        format: true,
      };
      location.hash = "";
      // @ts-ignore
      return ReactDOM.createRoot(document.getElementById("root")).render(
        <Editor initialState={initialState} />
      );
    } catch (err) {
      console.log("url encoder failed");
    }
  } else {
    const initialState: PersistState = getLastState() ?? {
      code: data.hello,
      autorun: false,
      refresh: true,
      format: true,
    };
    // const initialState: PersistState = {
    //   code: data.hello,
    //   autorun: false,
    //   refresh: true,
    //   format: true,
    // };

    // @ts-ignore
    ReactDOM.createRoot(document.getElementById("root")).render(
      <Editor initialState={initialState} />
    );
  }
}

main();
