---------------------------------------------------
-- Total Order Semantics (TO)

-- New table
CREATE TABLE
    kvstore (
        rowkey VARCHAR(31) NOT NULL,
        rowvalues VARCHAR(255),
        label INTEGER NOT NULL,
        PRIMARY KEY (rowkey)
    );

INSERT INTO kvstore (rowkey,rowvalues,label) VALUES ('a', 'Value for a', 0)
  ON DUPLICATE KEY UPDATE rowvalues=VALUES(rowvalues), label=VALUES(label);

-- Update trigger
DELIMITER $$
CREATE TRIGGER TO_put_semantics BEFORE UPDATE ON kvstore 
    FOR EACH ROW
    BEGIN
        IF OLD.label < NEW.label THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Security policy violation: Attempt to perform a sensitive upgrade (TO semantics).';
        END IF;
    END;
$$
DELIMITER ;
---------------------------------------------------



---------------------------------------------------
-- Partial Order Semantics (PO)

-- New Table:
CREATE TABLE
    kvstore (
        rowkey VARCHAR(31) NOT NULL,
        rowvalues VARCHAR(255),
        label INTEGER NOT NULL,
        PRIMARY KEY(rowkey, label)
    );

INSERT INTO t1 (a,b,c) VALUES (1,2,3)
  ON DUPLICATE KEY UPDATE c=c+1;

---------------------------------------------------



---------------------------------------------------
-- Scratch

CREATE TRIGGER upd_check BEFORE UPDATE ON account
   FOR EACH ROW
   BEGIN
       IF NEW.amount < 0 THEN
           SET NEW.amount = 0;
       ELSEIF NEW.amount > 100 THEN
           SET NEW.amount = 100;
       END IF;
   END;//

SHOW DATABASES;
SHOW TABLES;

DROP DATABASE <name>;
CREATE DATABASE <name>;
USE <name>; -- Setting the DB for the next commands

SET GLOBAL log_bin_trust_function_creators = 1;

DESC <table_name>;

-- Show logs
SELECT * FROM general_log WHERE user_host LIKE 'vmwuser%';

