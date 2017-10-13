const mysql = require("mysql");
const bbPromise = require('bluebird');

class SecureKV_TO {
    constructor(h, u, pwd, tbl) {
        this.con = bbPromise.promisifyAll(mysql.createConnection({
            host: h,
            user: u,
            password: pwd,
            database: "securekvto"
        }));
        if (tbl) {
            this.table = tbl;
        } else {
            this.table = 'kvstore';
        }

    }

    init() {
        const createTableSql = `
CREATE TABLE ${this.table} (
    rowkey VARCHAR(32) NOT NULL,
    rowvalues VARCHAR(255),
    label INTEGER NOT NULL,
    PRIMARY KEY (rowkey)
);
        `;

        const addUpdateTrigger = `
CREATE TRIGGER TO_put_semantics BEFORE UPDATE ON ${this.table} 
    FOR EACH ROW
    BEGIN
        IF OLD.label < NEW.label THEN
            SIGNAL SQLSTATE "45000"
                SET MESSAGE_TEXT = "Security policy violation: Attempt to perform a sensitive upgrade (TO semantics).";
        END IF;
    END;
    `;

        const tableSql = `
SHOW TABLES like ?;
        `;

        console.log("** DEBUG: Secure K-V (TO) - Call to init.");
        return this.con.connectAsync()
            .then(() => console.log("** DEBUG: Secure K-V (TO) - Connection successful."))
            .then(() => this.con.queryAsync(tableSql, [this.table]))
            .then((result) => {
                console.log("** DEBUG: Secure K-V (TO) - Succeeded getting list of tables.");
                if (result.length === 0) {
                    console.log("** DEBUG: Secure K-V (TO) - Table does not exists in database. Creating table.");
                    return this.con.queryAsync(createTableSql)
                        .then(() => console.log("** DEBUG: Secure K-V (TO) - Successfully created table."))
                        .then(() => this.con.queryAsync(addUpdateTrigger))
                        .then(() => console.log("** DEBUG: Secure K-V (TO) - Successfully added update trigger to table."))
                } else {
                    console.log("** DEBUG: Secure K-V (TO) - Table exists in database.");
                }
            })
            .catch((err) => {
                console.log("** DEBUG: Secure K-V (TO) - Failed in Init.");
                return bbPromise.reject(err);
            });
    }

    close() {
        console.log("** DEBUG: Secure K-V (TO) - Call to close.");
        return this.con.endAsync()
            .then(() => console.log("** DEBUG: Secure K-V (TO) - Connection close successful."))
            .catch((err) => {
                console.log("** DEBUG: Secure K-V (TO) - Failed closing connection.");
                return bbPromise.reject(err);
            });
    }

    put (k, v, l) {
        const sql = `
INSERT INTO ${this.table} (rowkey,rowvalues,label) 
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
        rowvalues=VALUES(rowvalues), label=VALUES(label);
        `;

        console.log("** DEBUG: Secure K-V (TO) - Call to put.");
        console.log("** DEBUG: Secure K-V (TO) -   Key:   " + k + ".");
        console.log("** DEBUG: Secure K-V (TO) -   Value: " + v + ".");

        return this.con.queryAsync(sql,[k,v,l])
            .then((result) => {
                console.log("** DEBUG: Secure K-V (TO) - Query successful - inserting values.");
                console.log("** DEBUG: Secure K-V (TO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (TO) - Query result />");
            })
            .catch((err) => {
                console.log("** DEBUG: Secure K-V (TO) - Query failed - inserting values.");
                return bbPromise.reject(err);
            });
    }

    get (k, l) {
        const sql = `
SELECT rowvalues 
FROM ${this.table} 
WHERE rowkey = ? AND
      label <= ?;
        `;

        console.log("** DEBUG: Secure K-V (TO) - Call to get.");
        console.log("** DEBUG: Secure K-V (TO) -   Key:   " + k + ".");
        return this.con.queryAsync(sql, [k,l])
            .then((result) => {
                console.log("** DEBUG: Secure K-V (TO) - Query successful - getting values.");
                console.log("** DEBUG: Secure K-V (TO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (TO) - Query result />");

                if (result.length === 0) return "";
                if (result.length === 1) return result[0]["rowvalues"];
                if (result.length > 1) bbPromise.reject("Inconsistent KeyValueStore");
            })
            .catch((err) => {
                console.log("** DEBUG: Secure K-V (TO) - Query failed - getting values.");
                return bbPromise.reject(err);
            });
    }

    del (k, l) {
        const sql = `
DELETE FROM ${this.table}
WHERE rowkey = ? AND
      label >= ?;
        `;

        console.log("** DEBUG: Secure K-V (TO) - Call to del.");
        console.log("** DEBUG: Secure K-V (TO) -   Key:   " + k + ".");
        return this.con.queryAsync(sql, [k,l])
            .then((result) => {
                console.log("** DEBUG: Secure K-V (TO) - Query successful - deleting value.");
                console.log("** DEBUG: Secure K-V (TO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (TO) - Query result />");
            })
            .catch((err) => {
                console.log("** DEBUG: Secure K-V (TO) - Query failed - deleting value.");
                return bbPromise.reject(err);
            });
    }

    keys(l) {
        const sql = `
SELECT rowkey 
FROM ${this.table} 
WHERE label <= ?;
        `;

        console.log("** DEBUG: Secure K-V (TO) - Call to keys.");
        return this.con.queryAsync(sql, [l])
            .then((result) => {
                console.log("** DEBUG: Secure K-V (TO) - Query successful - getting keys.");
                console.log("** DEBUG: Secure K-V (TO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (TO) - Query result />");

                return result.map(row => row["rowkey"]);
            })
            .catch((err) => {
                console.log("** DEBUG: Secure K-V (TO) - Query failed - getting keys.");
                return bbPromise.reject(err);
            });
    }

    entries(l) {
        const sql = `
SELECT rowkey, rowvalues 
FROM ${this.table} 
WHERE label <= ?;
        `;

        console.log("** DEBUG: Secure K-V (TO) - Call to entries.");
        return this.con.queryAsync(sql, [l])
            .then((result) => {
                console.log("** DEBUG: Secure K-V (TO) - Query successful - getting entries.");
                console.log("** DEBUG: Secure K-V (TO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (TO) - Query result />");

                return result.map((row) => ({
                    key: row["rowkey"],
                    value: row["rowvalues"],
                }));
            })
            .catch((err) => {
                console.log("** DEBUG: Secure K-V (TO) - Query failed - getting entries.");
                return bbPromise.reject(err);


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

    bbPromise.resolve()
        .then(() => console.log("************************"))
        .then(() => console.log("Store Init Test:"))
        .then(() => kv.init())
        .catch((err) => console.log("##### Init Test Error: " + err))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Put Test:"))
        .then(() => kv.entries(5)).then((result) => console.log(result))
        .then(() => kv.put('a', 'value for a', 5))
        .then(() => kv.entries(5)).then((result) => console.log(result))
        .then(() => kv.put('b', 'a value for b', 1))
        .then(() => kv.entries(5)).then((result) => console.log(result))
        .then(() => kv.put('a', 'another value for a', 5))
        .then(() => kv.entries(5)).then((result) => console.log(result))
        .then(() => kv.put('a', 'less sensitive value for a', 2))
        .then(() => kv.entries(5)).then((result) => console.log(result))
        .catch((err) => console.log("##### Put Test Error: " + err))
        .then(() => kv.put('a', 'trying a sensitive upgrade', 5))
        .then(() => console.log("##### Put test expected to fail! (Should have been a NSU error.)"))
        .catch((err) => console.log("Expecting a 'no sensitive upgrade' failure: " + err))
        .then(() => kv.entries(5)).then((result) => console.log(result))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Get Test:"))
        .then(() => kv.get('a', 1))
        .then((result) => console.log("Stored value for key a with label 1: " + result))
        .then(() => kv.get('b', 1))
        .then((result) => console.log("Stored value for key b with label 1: " + result))
        .catch((err) => console.log("##### Get Test Error: " + err))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Keys Test:"))
        .then(() => kv.keys(1))
        .then((result) => console.log("Stored keys for label 1: " + result))
        .then(() => kv.keys(5))
        .then((result) => console.log("Stored keys for label 5: " + result))
        .catch((err) => console.log("##### Keys Test Error: " + err))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Entries Test:"))
        .then(() => kv.entries(1))
        .then((result) => console.log("Stored entries for label 1: " + result))
        .then(() => kv.entries(5))
        .then((result) => console.log("Stored entries for label 5: " + result))
        .catch((err) => console.log("##### Entries Test Error: " + err))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Delete Test:"))
        .then(() => kv.entries()).then((result) => console.log(result))
        .then(() => kv.del('a', 5))
        .then(() => kv.entries()).then((result) => console.log(result))
        .then(() => kv.del('a', 1))
        .then(() => kv.entries()).then((result) => console.log(result))
        .catch((err) => console.log("##### Delete Test Error: " + err))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Close Test:"))
        .then(() => console.log("Connection state : " + kv.con.state))
        .then(() => kv.close())
        .then(() => console.log("Connection state : " + kv.con.state))
        .catch((err) => console.log("##### Close Test Error: " + err))
        .then(() => console.log("************************"));


}
