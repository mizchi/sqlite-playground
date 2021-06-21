// highlight by https://marketplace.visualstudio.com/items?itemName=derefs.vscode-inline-sql-highlight

export const hello = /*sql*/ `-- setup
CREATE TABLE test (id INT NOT NULL, name VARCHAR NOT NULL);
INSERT INTO test VALUES (1, "xxx"), (2, "yyy");

-- run
SELECT * FROM test;
SELECT count(*) as x FROM test;
`;

export const index = /*sql*/ `-- setup
CREATE TABLE user (id INT NOT NULL, name VARCHAR NOT NULL, age INT NOT NULL);
INSERT INTO user VALUES 
  (1, "xxx", 19),
  (2, "yyy", 50),
  (3, "zzz", 80);

CREATE INDEX user_age_index on user(age);

-- run
SELECT name FROM user WHERE age > 20;
`;
