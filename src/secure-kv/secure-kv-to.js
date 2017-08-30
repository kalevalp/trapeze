const mysql = require('mysql');

// "serverlessproject.c1kfax8igvaq.us-west-1.rds.amazonaws.com:3306"
// "vmwuser"
// "serverlessifc",
class SecureKV_TO {
    constructor(h, u, pwd) {
        this.con = mysql.createConnection({
            host: h,
            user: u,
            password: pwd,
            database: "securekv"
        });
    }

    init() {

        function createTable() {
            const createTableSql = `
CREATE TABLE kvstore (
    rowkey VARCHAR(31) NOT NULL,
    rowvalues VARCHAR(255),
    label INTEGER NOT NULL,
    PRIMARY KEY (rowkey)
);
            `;
            this.con.connect(createTableSql, function (err, result) {
                if (err) throw err;
                // console.log(result);
            });

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
            this.con.connect(addUpdateTrigger, ['kvstore'], function (err, result) {
                if (err) throw err;
                // console.log(result);
            });
        }

        const tableSql = `
SHOW TABLES like ?;
        `;
        this.con.connect(tableSql, ['kvstore'], function (err, result) {
            if (err) throw err;
            if (result.length === 0) {
                createTable()
            }
        })
    }

    put (k, v, l) {
        const sql = `
INSERT INTO kvstore (rowkey,rowvalues,label) 
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
        rowvalues=VALUES(rowvalues), label=VALUES(label);
        `;

        con.connect(sql,[k,v,l], function (err, result) {
            if (err) throw err;
            // console.log(result);
        });
    }
    get (k, l) {
        const sql = `
SELECT rowvalue 
FROM kvstore 
WHERE rowkey = ? AND
      label <= ?;
    `;

        con.connect(function(err) {
            if (err) throw err;
            con.query(sql, [k,l], function (err, result) {
                if (err) throw err;
                if (result.length === 0) return "";
                if (result.length === 1) return result["rowvalue"];
                if (result.length > 1) throw "Inconsistent KeyValueStore";

                // console.log(result);
            });
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
    console.log("Connection Test:");
    kv.con.connect(function (err) {
       if (err) throw err;
       console.log("Connected Successfully!")
    });
    console.log("************************");
    console.log("**");
    console.log("************************");
    console.log("Table Creation Test:");
    kv.con.connect("SHOW TABLES;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.init();
    kv.con.connect("SHOW TABLES;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    console.log("************************");
    console.log("**");
    console.log("************************");
    console.log("Put Test:");
    kv.con.connect("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.put('a', 'value for a', 5);
    kv.con.connect("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.put('b', 'a value for b', 1);
    kv.con.connect("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.put('a', 'another value for a', 5);
    kv.con.connect("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    kv.put('a', 'less sensitive value for a', 2);
    kv.con.connect("SELECT * FROM kvstore;", function (err, result) {
        if (err) throw err;
        console.log(result);
    });
    try {
        kv.put('a', 'trying a sensitive upgrade', 5);
    } catch (err) {
        console.log(err)
    }
    kv.con.connect("SELECT * FROM kvstore;", function (err, result) {
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



}
