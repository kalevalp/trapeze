const mysql = require("mysql");

class SecureKV_TO {
    constructor(h, u, pwd) {
        this.con = mysql.createConnection({
            host: h,
            user: u,
            password: pwd,
            database: "securekv"
        });
    }

    init(callback) {
        const createTableSql = `
CREATE TABLE kvstore (
    rowkey VARCHAR(31) NOT NULL,
    rowvalues VARCHAR(255),
    label INTEGER NOT NULL,
    PRIMARY KEY (rowkey)
);
        `;

        const addUpdateTrigger = `
DELIMITER $$
CREATE TRIGGER TO_put_semantics BEFORE UPDATE ON ? 
    FOR EACH ROW
    BEGIN
        IF OLD.label < NEW.label THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Security policy violation: Attempt to perform a sensitive upgrade (TO semantics).';
        END IF;
    END;
$$
DELIMITER ;
        `;

        const tableSql = `
SHOW TABLES like ?;
        `;


        this.con.connect((err) => {
            if (err) {
                callback(err);
            } else {
                console.log("** Secure K-V (TO) Connected Successfully!");

                this.con.query(tableSql, ['kvstore'], (err, result) => {
                    if (err) {
                        callback(err);
                    } else {
                        if (result.length === 0) {
                            this.con.query(createTableSql, (err, result) => {
                                if (err) {
                                    callback(err);
                                } else {
                                    this.con.query(addUpdateTrigger, ['kvstore'], (err, result) => {
                                        if (err) {
                                            callback(err);
                                        }
                                        callback();
                                    });
                                }
                            });
                        } else {
                            callback();
                        }
                    }
                });

            }
        });
    }

    close(callback) {
        this.con.end((err) => {
            if (err) {
                callback(err);
            } else {
                console.out("** Secure K-V (TO) Connection Closed Successfully!")
                callback();
            }
        })
    }

    put (k, v, l, callback) {
        const sql = `
INSERT INTO kvstore (rowkey,rowvalues,label) 
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
        rowvalues=VALUES(rowvalues), label=VALUES(label);
        `;

        this.con.query(sql,[k,v,l], (err, result) => {
            if (err) {
                callback(err);
            } else {
                callback();
            }
        });
    }

    get (k, l, callback) {
        const sql = `
SELECT rowvalue 
FROM kvstore 
WHERE rowkey = ? AND
      label <= ?;
        `;

        this.con.query(sql, [k,l], (err, result) => {
            if (err) {
                callback(err);
            } else if (result.length === 0) {
                callback(null, "");
            } else if (result.length === 1) {
                callback(null, result[0]["rowvalue"]);
            } else if (result.length > 1) {
                callback("Inconsistent KeyValueStore");
            }
        });
    }
}

module.exports.SecureKV_TO = SecureKV_TO;

/* ************************
 *          Tests
 * ************************ */

if (process.argv[2] === "test") {
    const kv = new SecureKV_TO(
        process.argv[3],
        process.argv[4],
        process.argv[5]
    );
    console.log("************************");
    console.log("Store Init Test:");
    kv.init();
    kv.con.query("SHOW TABLES;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    console.log("************************");
    console.log("**");
    console.log("************************");
    console.log("Put Test:");
    kv.con.query("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.put('a', 'value for a', 5);
    kv.con.query("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.put('b', 'a value for b', 1);
    kv.con.query("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.put('a', 'another value for a', 5);
    kv.con.query("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.put('a', 'less sensitive value for a', 2);
    kv.con.query("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    try {
        kv.put('a', 'trying a sensitive upgrade', 5);
    } catch (err) {
        console.log(err)
    }
    kv.con.query("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    console.log("************************");
    console.log("**");
    console.log("************************");
    console.log("Get Test:");
    console.log("Stored value for key a : " + kv.get('a'));
    console.log("Stored value for key b : " + kv.get('b'));
    console.log("************************");
    console.log("**");
    console.log("************************");
    console.log("Close Test:");
    console.log("Connection state : " + kv.con.state);
    kv.close();
    console.log("Connection state : " + kv.con.state);
    console.log("************************");

}
