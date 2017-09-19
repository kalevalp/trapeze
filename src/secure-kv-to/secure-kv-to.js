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
    rowkey VARCHAR(32) NOT NULL,
    rowvalues VARCHAR(255),
    label INTEGER NOT NULL,
    PRIMARY KEY (rowkey)
);
        `;

        const delimiterDollar = `DELIMITER $$`;
        const delimiterSemi = `DELIMITER ;`;
        const addUpdateTrigger = `
CREATE TRIGGER TO_put_semantics BEFORE UPDATE ON kvstore 
    FOR EACH ROW
    BEGIN
        IF OLD.label < NEW.label THEN
            SIGNAL SQLSTATE "45000"
                SET MESSAGE_TEXT = "Security policy violation: Attempt to perform a sensitive upgrade (TO semantics).";
        END IF;
    END;
    `;
// $$
//         `;

        const tableSql = `
SHOW TABLES like ?;
        `;

        console.log("** DEBUG: Secure K-V (TO) - Call to init.");
        this.con.connect((err) => {
            if (err) {
                console.log("** DEBUG: Secure K-V (TO) - Connection failed.");
                callback(err);
            } else {
                console.log("** DEBUG: Secure K-V (TO) - Connection successful.");
                this.con.query(tableSql, ['kvstore'], (err, result) => {
                    if (err) {
                        console.log("** DEBUG: Secure K-V (TO) - Failed getting list of tables.");
                        callback(err);
                    } else {
                        console.log("** DEBUG: Secure K-V (TO) - Succeeded getting list of tables.");
                        if (result.length === 0) {
                            console.log("** DEBUG: Secure K-V (TO) - Table does not exists in database. Creating table.");
                            this.con.query(createTableSql, (err, result) => {
                                if (err) {
                                    console.log("** DEBUG: Secure K-V (TO) - Failed creating table.");
                                    callback(err);
                                } else {
                                    console.log("** DEBUG: Secure K-V (TO) - Successfully created table.");
                                    // this.con.query(delimiterDollar, (err, result) => {
                                    //     if (err) {
                                    //         console.log("** DEBUG: Secure K-V (TO) - Failed setting the delimiter to $$.");
                                    //         callback(err);
                                    //     } else {
                                    //         console.log("** DEBUG: Secure K-V (TO) - Successfully set the delimiter to $$.");
                                            this.con.query(addUpdateTrigger, (err, result) => {
                                                if (err) {
                                                    console.log("** DEBUG: Secure K-V (TO) - Failed adding update trigger to table.");
                                                    callback(err);
                                                } else {
                                                    console.log("** DEBUG: Secure K-V (TO) - Successfully added update trigger to table.");
                                                    // this.con.query(delimiterSemi, (err, result) => {
                                                    //     if (err) {
                                                    //         console.log("** DEBUG: Secure K-V (TO) - Failed setting the delimiter to ;.");
                                                    //         callback(err);
                                                    //     } else {
                                                    //         console.log("** DEBUG: Secure K-V (TO) - Successfully set the delimiter to ;.");
                                                            callback();
                                                        // }
                                                    // })
                                                }
                                            });
                                        // }
                                    // });
                                }
                            });
                        } else {
                            console.log("** DEBUG: Secure K-V (TO) - Table exists in database.");
                            callback();
                        }
                    }
                });

            }
        });
    }

    close(callback) {
        console.log("** DEBUG: Secure K-V (TO) - Call to close.");
        this.con.end((err) => {
            if (err) {
                console.log("** DEBUG: Secure K-V (TO) - Failed closing connectionß.");
                callback(err);
            } else {
                console.log("** DEBUG: Secure K-V (TO) - Connection close successful.");
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

        console.log("** DEBUG: Secure K-V (TO) - Call to put.");
        console.log("** DEBUG: Secure K-V (TO) -   Key:   " + k + ".");
        console.log("** DEBUG: Secure K-V (TO) -   Value: " + v + ".");

        this.con.query(sql,[k,v,l], (err, result) => {
            if (err) {
                console.log("** DEBUG: Secure K-V (TO) - Query failed - inserting values.");
                callback(err);
            } else {
                console.log("** DEBUG: Secure K-V (TO) - Query successful - inserting values.");
                console.log("** DEBUG: Secure K-V (TO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (TO) - Query result />");

                callback();
            }
        });
    }

    get (k, l, callback) {
        const sql = `
SELECT rowvalues 
FROM kvstore 
WHERE rowkey = ? AND
      label <= ?;
        `;

        console.log("** DEBUG: Secure K-V (TO) - Call to get.");
        console.log("** DEBUG: Secure K-V (TO) -   Key:   " + k + ".");
        this.con.query(sql, [k,l], (err, result) => {
            if (err) {
                console.log("** DEBUG: Secure K-V (TO) - Query failed - getting values.");
                callback(err);
            } else {
                console.log("** DEBUG: Secure K-V (TO) - Query successful - getting values.");
                console.log("** DEBUG: Secure K-V (TO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (TO) - Query result />");

                if (result.length === 0) callback(null, "");
                if (result.length === 1) callback(null, result[0]["rowvalues"]);
                if (result.length > 1) callback("Inconsistent KeyValueStore");
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
