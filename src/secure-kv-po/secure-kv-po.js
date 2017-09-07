import mysql from "mysql";
import {getAllLE, getTransitiveClosure} from "po-utils";

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
        this.po = getTransitiveClosure(partialOrder);
    }

    init(callback) {
        function createTable() {
            const createTableSql = `
CREATE TABLE kvstore (
    rowkey VARCHAR(31) NOT NULL,
    rowvalues VARCHAR(255),
    label INTEGER NOT NULL,
    PRIMARY KEY (rowkey, label)
);
            `;
            this.con.query(createTableSql, function (err, result) {
                if (err) callback(err);
                // console.log(result);
            });

            const cond = getCondFromPOTC(this.po);

            const addInsertTrigger = `
CREATE TRIGGER PO_put_semantics BEFORE INSERT ON ? 
    DELETE FROM ? WHERE ?;
`;
            this.con.query(addInsertTrigger, ['kvstore', 'kvstore', cond], function (err, result) {
                if (err) callback(err);
                // console.log(result);
            });
        }

        this.con.connect(function (err) {
            if (err) callback(err);
            console.log("** Secure K-V (PO) Connected Successfully!")
        });

        const tableSql = `
SHOW TABLES like ?;
        `;
        this.con.query(tableSql, ['kvstore'], function (err, result) {
            if (err) callback(err);
            if (result.length === 0) {
                createTable()
            }
        })
    }

    close(callback) {
        this.con.end(function (err) {
            if (err) callback(err);
            console.out("** Secure K-V (PO) Connection Closed Successfully!")

        })
    }

    put (k, v, l, callback) {
        const sql = `
INSERT INTO kvstore (rowkey,rowvalues,label) 
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
        rowvalues=VALUES(rowvalues);
        `;

        this.con.query(sql,[k,v,l], function (err, result) {
            if (err) callback(err);
            // console.log(result);
        });
    }

    /**
     * Performs a get operation from the key-value store for a given key and label.
     *
     * @param k Key
     * @param l Security label
     * @param callback
     */
    get (k, l, callback) {
        const sql = `
SELECT rowvalue 
FROM kvstore 
WHERE rowkey = ? AND
      label IN ?;
    `;

        // let gtLabels = new Set(this.po[l]);
        // gtLabels.delete(l);

        let leLabels = getAllLE(pl,l);

        this.con.query(sql, [k,"(" + [...leLabels].join(", ") + ")"], function (err, result) {
            if (err) callback(err);
            if (result.length === 0) callback(null,"");
            else {
                callback(null,
                    result.reduce(function(max, curr) {
                        if (this.po[max["label"]].has(curr["label"])) {
                            return curr;
                        } else {
                            return max;
                        }
                    })["rowvalue"]);
            }
        });
    }
}

module.exports.SecureKV_PO = SecureKV_PO;

function getCondFromPOTC(potc) {
    return "(" +
        Object.keys(potc).map(function (x) {
            return "NEW.label = " + x + " AND label IN (" + [...potc[x]].join(", ") + ")";
        }).join(") OR (") +
        ")";
}

/* ************************
 *          Tests
 * ************************ */
if (process.argv[2] === "test") {
    const x = {'1': [2, 3], '2': [3], '3': [5, 6], '4': []};
    const potc = getTransitiveClosure(x);
    console.log("************************");
    console.log("Transitive closure test:");
    console.log(x);
    console.log(potc);
    console.log("************************");
    console.log("**");
    console.log("************************");
    console.log("Condition test:");
    console.log(getCondFromPOTC(potc));
    console.log("************************");
}