const mysql = require ("mysql");
const {PartialOrder} = require ("po-utils");

class SecureKV_PO {
    constructor(h, u, pwd, partialOrder) {
        this.con = mysql.createConnection({
            host: h,
            user: u,
            password: pwd,
            database: "securekv"
        });
        this.po = partialOrder;
    }

    init(callback) {
        const tableSql = `
SHOW TABLES like ?;
        `;

        const createTableSql = `
CREATE TABLE kvstore_po (
    rowkey VARCHAR(32) NOT NULL,
    rowvalues VARCHAR(255),
    label INTEGER NOT NULL,
    PRIMARY KEY (rowkey, label)
);
        `;
        const cond = getCondFromPOTC(this.po.potc);
        const addInsertTrigger = `
CREATE TRIGGER PO_put_semantics BEFORE INSERT ON kvstore_po 
    DELETE FROM kvstore_po WHERE ${cond};
        `;

        console.log("** DEBUG: Secure K-V (PO) - Call to init.");
        this.con.connect((err) => {
            if (err) {
                console.log("** DEBUG: Secure K-V (PO) - Connection failed.");
                callback(err);
            } else {
                console.log("** DEBUG: Secure K-V (PO) - Connection successful.");
                this.con.query(tableSql, ['kvstore_po'], (err, result) => {
                    if (err) {
                        console.log("** DEBUG: Secure K-V (PO) - Failed getting list of tables.");
                        callback(err);
                    }
                    else {
                        console.log("** DEBUG: Secure K-V (PO) - Succeeded getting list of tables.");
                        if (result.length === 0) {
                            console.log("** DEBUG: Secure K-V (PO) - Table does not exists in database. Creating table.");
                            this.con.query(createTableSql, (err, result) => {
                                if (err) {
                                    console.log("** DEBUG: Secure K-V (PO) - Failed creating table.");
                                    callback(err);
                                } else {
                                    console.log("** DEBUG: Secure K-V (PO) - Successfully created table.");
                                    this.con.query(addInsertTrigger, (err, result) => {
                                        if (err) {
                                            console.log("** DEBUG: Secure K-V (PO) - Failed adding insert trigger to table.");
                                            callback(err);
                                        }
                                        else {
                                            console.log("** DEBUG: Secure K-V (PO) - Successfully added insert trigger to table.");
                                            callback();
                                        }
                                    });
                                }
                            });
                        } else {
                            console.log("** DEBUG: Secure K-V (PO) - Table exists in database.");
                            callback();
                        }
                    }
                })
            }
        });
    }

    close(callback) {
        console.log("** DEBUG: Secure K-V (PO) - Call to close.");
        this.con.end(function (err) {
            if (err) {
                console.log("** DEBUG: Secure K-V (PO) - Failed closing connectionß.");
                callback(err);
            } else {
                console.log("** DEBUG: Secure K-V (PO) - Connection close successful.");
                callback();
            }
        })
    }

    put (k, v, l, callback) {
        const sql = `
INSERT INTO kvstore_po (rowkey,rowvalues,label) 
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE 
        rowvalues=VALUES(rowvalues);
        `;

        console.log("** DEBUG: Secure K-V (PO) - Call to put.");
        console.log("** DEBUG: Secure K-V (PO) -   Key:   " + k + ".");
        console.log("** DEBUG: Secure K-V (PO) -   Value: " + v + ".");

        this.con.query(sql,[k,v,l], function (err, result) {
            if (err) {
                console.log("** DEBUG: Secure K-V (PO) - Query failed - inserting values.");
                callback(err);
            } else {
                console.log("** DEBUG: Secure K-V (PO) - Query successful - inserting values.");
                console.log("** DEBUG: Secure K-V (PO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (PO) - Query result />");

                callback();
            }
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
        let leLabels = this.po.getAllLE(l);
        const sql = `
SELECT rowvalue, label 
FROM kvstore_po 
WHERE rowkey = ? AND
      label IN ${"(" + [...leLabels].join(", ") + ")"};
    `;

        console.log("** DEBUG: Secure K-V (PO) - Call to get.");
        console.log("** DEBUG: Secure K-V (PO) -   Key:   " + k + ".");
        this.con.query(sql, [k], function (err, result) {
            if (err) {
             console.log("** DEBUG: Secure K-V (PO) - Query failed - getting values.");
                callback(err);
            }
            else {
                console.log("** DEBUG: Secure K-V (PO) - Query successful - getting values.");
                console.log("** DEBUG: Secure K-V (PO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (PO) - Query result />");

                callback(result);

                // if (result.length === 0) callback(null,"");
                // else {
                //     callback(null,
                //         result.reduce(function(max, curr) {
                //             if (this.po.potc[max["label"]].has(curr["label"])) {
                //                 return curr;
                //             } else {
                //                 return max;
                //             }
                //         })["rowvalue"]);
                // }
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
    const po = new PartialOrder(x);
    console.log("************************");
    console.log("Condition test:");
    console.log(getCondFromPOTC(po.potc));
    console.log("************************");
}