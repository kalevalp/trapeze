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
    rowkey VARCHAR(31) NOT NULL,
    rowvalues VARCHAR(255),
    PRIMARY KEY (rowkey)
);
            `;

        this.con.connect((err) => {
            if (err) callback(err);
            console.log("** K-V Store Connected Successfully!");
            this.con.query(showTablesSql, ['kvstore'], (err, result) => {
                if (err) callback(err);
                if (result.length === 0) {
                    this.con.query(createTableSql, (err, result) => {
                        if (err) callback(err);
                        // console.log(result);
                        callback();
                    });
                }
            });
        });

    }

    close(callback) {
        this.con.end((err) => {
            if (err) callback(err);
            console.out("** K-V Store Connection Closed Successfully!")
            callback();
        })
    }

    put (k, v, callback) {
        const putQuerySql = `
INSERT INTO kvstore (rowkey,rowvalues) 
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE 
        rowvalues;
        `;

        this.con.query(putQuerySql,[k,v], (err, result) => {
            if (err) callback(err);
            callback();
            // console.log(result);
        });
    }
    get (k, callback) {
        const getQuerySql = `
SELECT rowvalue 
FROM kvstore 
WHERE rowkey = ?;
    `;

        this.con.query(getQuerySql, [k], (err, result) => {
            if (err) callback(err);
            if (result.length === 0) callback(null, "");
            if (result.length === 1) callback(null, result["rowvalue"]);
            if (result.length > 1) callback("Inconsistent KeyValueStore");

            // console.log(result);
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
