const mysql = require("mysql");

class KV_Store {
    constructor(h, u, pwd) {
        this.con = mysql.createConnection({
            host: h,
            user: u,
            password: pwd,
            database: "unsecurekv"
        });
    }



    init(callback) {
        const showTablesSql = `
SHOW TABLES like ?;
        `;
        const createTableSql = `
CREATE TABLE kvstore (
    rowkey VARCHAR(32) NOT NULL,
    rowvalues VARCHAR(255),
    PRIMARY KEY (rowkey)
);
            `;

        console.log("** DEBUG: Call to init.");
        this.con.connect((err) => {
            if (err) {
                console.log("** DEBUG: K-V store connection failed.");
                callback(err);
            } else {
                console.log("** DEBUG: K-V store connected successfully.");
                this.con.query(showTablesSql, ['kvstore'], (err, result) => {
                    if (err) {
                        console.log("** DEBUG: Failed getting list of tables in database.");
                        callback(err);
                    } else {
                        console.log("** DEBUG: Query successful - getting list of tables in database.");
                        if (result.length === 0) {
                            console.log("** DEBUG: No kvstore table in database. Calling query to create table.");
                            this.con.query(createTableSql, (err, result) => {
                                if (err) {
                                    console.log("** DEBUG: Failed creating table.");
                                    callback(err);
                                } else {
                                    console.log("** DEBUG: Query successful - creating table.");
                                    // console.log(result);
                                    callback();
                                }
                            });
                        } else {
                            console.log("** DEBUG: kvstore table already exists in the database. No need to create it.");
                            callback();
                        }
                    }
                });
            }
        });

    }

    close(callback) {
        console.log("** DEBUG: Call to close.");
        this.con.end((err) => {
            if (err) {
                console.log("** DEBUG: Failed closing the database connection.");
                callback(err);
            } else {
                console.log("** DEBUG: K-V store connection closed successfully.");
                callback();
            }
        })
    }

    put (k, v, callback) {
        const putQuerySql = `
INSERT INTO kvstore (rowkey,rowvalues) 
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE 
        rowvalues = VALUES(rowvalues);
        `;
        console.log("** DEBUG: Call to put.");
        console.log("** DEBUG:   Key:   " + k + ".");
        console.log("** DEBUG:   Value: " + v + ".");

        this.con.query(putQuerySql,[k,v], (err, result) => {
            if (err) {
                console.log("** DEBUG: Query failed - inserting values.");
                callback(err);
            } else {
                console.log("** DEBUG: Query successful - inserting values.");
                console.log("** DEBUG: Query result:");
                console.log(result);
                console.log("** DEBUG: Query result />");
                callback();
            }
        });
    }
    get (k, callback) {
        const getQuerySql = `
SELECT rowvalues 
FROM kvstore 
WHERE rowkey = ?;
    `;
        console.log("** DEBUG: Call to get.");
        console.log("** DEBUG:   Key:   " + k + ".");

        this.con.query(getQuerySql, [k], (err, result) => {
            if (err) {
                console.log("** DEBUG: Query failed - getting values.");
                callback(err);
            } else {
                console.log("** DEBUG: Query successful - getting values.");
                console.log("** DEBUG: Query result:");
                console.log(result);
                console.log("** DEBUG: Query result />");

                if (result.length === 0) callback(null, "");
                if (result.length === 1) callback(null, result[0]["rowvalues"]);
                if (result.length > 1) callback("Inconsistent KeyValueStore");
            }
        });
    }

    keys(callback) {
        const keysQuerySql = `
SELECT rowkey 
FROM kvstore;
    `;
        console.log("** DEBUG: Call to keys.");

        this.con.query(keysQuerySql, (err, result) => {
            if (err) {
                console.log("** DEBUG: Query failed - getting keys.");
                callback(err);
            } else {
                console.log("** DEBUG: Query successful - getting keys.");
                console.log("** DEBUG: Query result:");
                console.log(result);
                console.log("** DEBUG: Query result />");

                callback(null, result.map( x => x["rowkey"]));
            }
        });
    }

    del(k, callback) {
        const deleteQuerySql = `
DELETE FROM kvstore
WHERE rowkey = ?;
    `;
        console.log("** DEBUG: Call to delete.");
        console.log("** DEBUG:   Key:   " + k + ".");

        this.con.query(deleteQuerySql, [k], (err, result) => {
            if (err) {
                console.log("** DEBUG: Query failed - deleting key.");
                callback(err);
            } else {
                console.log("** DEBUG: Query successful - deleting key.");
                console.log("** DEBUG: Query result:");
                console.log(result);
                console.log("** DEBUG: Query result />");

                callback(null);
            }
        });
    }

    entries(callback) {
        const entriesQuerySql = `
SELECT rowkey, rowvalues 
FROM kvstore;
    `;
        console.log("** DEBUG: Call to entries.");

        this.con.query(entriesQuerySql, (err, result) => {
            if (err) {
                console.log("** DEBUG: Query failed - getting entries.");
                callback(err);
            } else {
                console.log("** DEBUG: Query successful - getting entries.");
                console.log("** DEBUG: Query result:");
                console.log(result);
                console.log("** DEBUG: Query result />");

                callback(null, result.map( x => {
                    return {
                        'key': x["rowkey"],
                        'val': x["rowvalues"],
                    };
                }));
            }
        });
    }
}

module.exports.KV_Store = KV_Store;

/* ************************
 *          Tests
 * ************************ */

if (process.argv[2] === "test") {
    const kv = new KV_Store(
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
    kv.put('a', 'value for a');
    kv.con.query("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.put('b', 'a value for b');
    kv.con.query("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.put('a', 'another value for a');
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
