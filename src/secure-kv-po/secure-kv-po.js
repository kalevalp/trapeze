const mysql = require ("mysql");
const {PartialOrder} = require ("po-utils");

class SecureKV_PO {
    constructor(h, u, pwd, partialOrder, tbl) {
        this.con = mysql.createConnection({
            host: h,
            user: u,
            password: pwd,
            database: "securekvpo"
        });
        this.po = partialOrder;
        if (tbl) {
            this.table = tbl;
        } else {
            this.table = 'kvstore';
        }
    }

    init(callback) {
        const tableSql = `
SHOW TABLES like ?;
        `;

        const createTableSql = `
CREATE TABLE ${this.table} (
    rowkey VARCHAR(32) NOT NULL,
    rowvalues VARCHAR(255),
    label VARCHAR(32) NOT NULL,
    PRIMARY KEY (rowkey, label)
);
        `;

        console.log("** DEBUG: Secure K-V (PO) - Call to init.");
        this.con.connect((err) => {
            if (err) {
                console.log("** DEBUG: Secure K-V (PO) - Connection failed.");
                callback(err);
            } else {
                console.log("** DEBUG: Secure K-V (PO) - Connection successful.");
                this.con.query(tableSql, [this.table], (err, result) => {
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
                                    callback();
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
                console.log("** DEBUG: Secure K-V (PO) - Failed closing connection.");
                callback(err);
            } else {
                console.log("** DEBUG: Secure K-V (PO) - Connection close successful.");
                callback();
            }
        })
    }

    /* ***********************************************
     *   This method uses sql transactions. I'm not
     * sure transactions are needed here at all.
     *   It's very likely that even having separate
     * operations, the entire thing is still
     * serializable.
     *   Would probably need to reverse the order of
     * delete and update operations. Which would
     * also require an addition of am ON DUPLICATE
     * clause to the insert.
     */
    put (k, v, l, callback) {
        let cond = getCondFromPOTC(this.po.potc, l);

        console.log("** DEBUG: Secure K-V (PO) - Call to put.");
        console.log("** DEBUG: Secure K-V (PO) -   Key:   " + k + ".");
        console.log("** DEBUG: Secure K-V (PO) -   Value: " + v + ".");

        this.con.beginTransaction((err) => {
            console.log("** DEBUG: Secure K-V (PO) - Starting transaction.");
            if (err) {
                console.log("** DEBUG: Secure K-V (PO) - Failed starting transaction.");
                callback(err);
            } else {
                console.log("** DEBUG: Secure K-V (PO) - Successfully started transaction.");
                this.con.query(`DELETE FROM ${this.table} WHERE rowkey = ? AND ${cond}`, [k], (err) => {
                    if (err) {
                        console.log("** DEBUG: Secure K-V (PO) - Failed deleting.");
                        callback(err);
                    } else {
                        console.log("** DEBUG: Secure K-V (PO) - Delete successful.");
                        this.con.query(`INSERT INTO ${this.table} (rowkey,rowvalues,label) VALUES (?, ?, ?)`, [k,v,l],  (err, results, fields) => {
                            if (err) {
                                console.log("** DEBUG: Secure K-V (PO) - Failed inserting.");
                                callback(err);
                            } else {
                                this.con.commit((err) => {
                                    if (err) {
                                        console.log("** DEBUG: Secure K-V (PO) - Failed committing transaction.");
                                        callback(err);
                                    } else {
                                        console.log("** DEBUG: Secure K-V (PO) - Transaction committed successfully.");
                                        callback();
                                    }
                                });
                            }
                        });
                    }
                });
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
SELECT rowvalues, label 
FROM ${this.table} 
WHERE rowkey = ? AND
      label IN ${"('" + [...leLabels].join("', '") + "')"};
    `;

        console.log("** DEBUG: Secure K-V (PO) - Call to get.");
        console.log("** DEBUG: Secure K-V (PO) -   Key:   " + k + ".");
        console.log("** DEBUG: Secure K-V (PO) - Get Query:");
        console.log(sql);
        console.log("** DEBUG: Secure K-V (PO) - Get Query /> ");
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

                callback(null,result);

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

    /* *****************************************************************************************
     *    Note: In our setting delete is an extremely non-transparent operation. To be secure
     *  delete has to remove only the facets with a higher label, but any subsequent reads
     *  will still see values with smaller (i.e. more public) labels. This is true even for
     *  the label doing the delete.
     *    A potential fix could actually write a special N/A value to the table. That way, any
     *  read that could be exposed to the delete operation would actually be exposed to the
     *  deletion.
     * ***************************************************************************************** */
    del (k, l, callback) {
        // TODO KALEV: Implement getAllGE
        let geLabels = this.po.getAllGE(l);
        const sql = `
DELETE FROM ${this.table}  
WHERE rowkey = ? AND
      label IN ${"('" + [...geLabels].join("', '") + "')"};
    `;

        console.log("** DEBUG: Secure K-V (PO) - Call to del.");
        console.log("** DEBUG: Secure K-V (PO) -   Key:   " + k + ".");
        console.log("** DEBUG: Secure K-V (PO) - Del Query:");
        console.log(sql);
        console.log("** DEBUG: Secure K-V (PO) - Del Query /> ");
        this.con.query(sql, [k], function (err, result) {
            if (err) {
                console.log("** DEBUG: Secure K-V (PO) - Query failed - deleting value.");
                callback(err);
            }
            else {
                console.log("** DEBUG: Secure K-V (PO) - Query successful - deleting value.");
                console.log("** DEBUG: Secure K-V (PO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (PO) - Query result />");

                callback();
            }
        });
    }

    keys(l, callback) {
        let leLabels = this.po.getAllLE(l);
        const sql = `
SELECT rowkey, label
FROM ${this.table} 
WHERE label IN ${"('" + [...leLabels].join("', '") + "')"};
    `;

        console.log("** DEBUG: Secure K-V (PO) - Call to keys.");
        console.log("** DEBUG: Secure K-V (PO) - Keys Query:");
        console.log(sql);
        console.log("** DEBUG: Secure K-V (PO) - Keys Query /> ");
        this.con.query(sql, function (err, result) {
            if (err) {
                console.log("** DEBUG: Secure K-V (PO) - Query failed - getting keys.");
                callback(err);
            }
            else {
                console.log("** DEBUG: Secure K-V (PO) - Query successful - getting keys.");
                console.log("** DEBUG: Secure K-V (PO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (PO) - Query result />");

                callback(null,result);
            }
        });
    }

    entries(l, callback) {
        let leLabels = this.po.getAllLE(l);
        const sql = `
SELECT rowkey, rowvalues, label
FROM ${this.table} 
WHERE label IN ${"('" + [...leLabels].join("', '") + "')"};
    `;

        console.log("** DEBUG: Secure K-V (PO) - Call to entries.");
        console.log("** DEBUG: Secure K-V (PO) - Entries Query:");
        console.log(sql);
        console.log("** DEBUG: Secure K-V (PO) - Entries Query /> ");
        this.con.query(sql, function (err, result) {
            if (err) {
                console.log("** DEBUG: Secure K-V (PO) - Query failed - getting entries.");
                callback(err);
            }
            else {
                console.log("** DEBUG: Secure K-V (PO) - Query successful - getting entries.");
                console.log("** DEBUG: Secure K-V (PO) - Query result:");
                console.log(result);
                console.log("** DEBUG: Secure K-V (PO) - Query result />");

                callback(null,result.map(row => {
                    return {
                        key: row["rowkey"],
                        val: row["rowvalues"],
                        lab: row["label"],
                    };
                }));
            }
        });
    }

}

module.exports.SecureKV_PO = SecureKV_PO;

function getCondFromPOTC(potc, label) {
    return "label IN ('" + [...potc[label]].join("', '") + "')";
}

/* ************************
 *          Tests
 * ************************ */
if (process.argv[2] === "test") {
    const x =  {
        "bottom" : ["userA", "userB"],
        "userA" : ["admin"],
        "userB" : ["admin"],
        "admin" : ["top"]
    };
    const po = new PartialOrder(x);
    console.log("************************");
    console.log("Condition test:");
    console.log(getCondFromPOTC(po.potc, "admin"));
    console.log("************************");
}