const mysql = require('mysql');

function getTransitiveClosure(po) {
    let stack = [];
    const potc = {};

    const allElems = new Set();
    for (const x in po) {
        allElems.add(parseInt(x));
        for (const y of po[x]) {
            allElems.add(y);
        }
    }
    for (const e of allElems) {
        potc[e] = new Set();
        potc[e].add(e);
    }

    Object.keys(po).forEach((k) => {
        stack = stack.concat(parseInt(k));

        while (stack.length > 0) {
            const elem = stack.pop();

            let gteElem = po[elem];

            if (gteElem) { // NULL check
                stack = stack.concat(gteElem);
            }

            potc[k].add(elem);
        }
    });

    return potc;
}

function getCondFromPOTC(potc) {
    Object.keys(potc).map(function (x) {
        if (potc[x].length > 0) {
            
        }

    });
}
// "serverlessproject.c1kfax8igvaq.us-west-1.rds.amazonaws.com:3306"
// "vmwuser"
// "serverlessifc",

class SecureKV_PO {
    constructor(h, u, pwd, partialOrder) {
        this.con = mysql.createConnection({
            host: h,
            user: u, 
            password: pwd,
            database: "securekv"
        });
        createTableIfTableExists();

        this.po = getTransitiveClosure(partialOrder);

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

            const cond = "";

            const addUpdateTrigger = `
DELIMITER $$
CREATE TRIGGER PO_put_semantics BEFORE UPDATE ON ? 
    FOR EACH ROW
    BEGIN
        IF ? OLD.label < NEW.label THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Security policy violation: Attempt to perform a sensitive upgrade (PO semantics).';
        END IF;
    END;
$$
DELIMITER ;
`;
            this.con.connect(addUpdateTrigger, [cond, 'kvstore'], function (err, result) {
                    if (err) throw err;
                    // console.log(result);
                });
        }

        function createTableIfTableExists() {
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

module.exports.SecureKV_PO = SecureKV_PO;




/* ************************
 *          Tests
 * ************************ */

var x = { '1': [ 2, 3 ], '2': [ 3 ], '3': [ 5, 6 ], '4': [] };
var potc = getTransitiveClosure(x);
console.log("************************")
console.log("Transitive closure test:")
console.log(x);
console.log(potc);
console.log("************************")
console.log("**")
console.log("************************")
console.log("Condition test:");
console.log(getCondFromPOTC(potc));
console.log("************************")
    
