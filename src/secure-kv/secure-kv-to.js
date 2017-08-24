var mysql = require('mysql');

var con = mysql.createConnection({
    host: "serverlessproject.c1kfax8igvaq.us-west-1.rds.amazonaws.com:3306",
    user: "vmwuser",
    password: "serverlessifc",
    database: "securekv"
});

var createTableSql = `
CREATE TABLE
    kvstore (
        rowkey VARCHAR(31) NOT NULL,
        rowvalues VARCHAR(255),
        label INTEGER NOT NULL,
        PRIMARY KEY (rowkey)
    );
` 
con.connect(createTableSql, function (err, result) {
        if (err) throw err;
        // console.log(result);
    });

var addUpdateTrigger = `
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
`

con.connect(addUpdateTrigger, function (err, result) {
        if (err) throw err;
        // console.log(result);
    });

modules.exports.put = function (k, v, l) {
    var sql = `
INSERT INTO kvstore (rowkey,rowvalues,label) 
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
        rowvalues=VALUES(rowvalues), label=VALUES(label);
    `

    con.connect(sql,[k,v,l], function (err, result) {
        if (err) throw err;
        // console.log(result);
    });
}

modules.exports.get = function (k, l) {
    var sql = `
SELECT rowvalue 
FROM kvstore 
WHERE rowkey = ? AND
      label <= ?;
    `

    con.connect(function(err) {
        if (err) throw err;
        con.query(sql, [k,l], function (err, result) {
            if (err) throw err;
            if (result.length == 0) return "";
            if (result.length == 1) return result["rowvalue"];
            if (result.length > 1) throw "Inconsistent KeyValueStore";

            // console.log(result);
        });
    });
}