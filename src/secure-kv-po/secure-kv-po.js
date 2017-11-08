const mysql = require ("mysql");
const {PartialOrder} = require ("po-utils");
const bbPromise = require('bluebird');

class SecureKV_PO {
    constructor(h, u, pwd, partialOrder, tbl) {
        this.con = bbPromise.promisifyAll(mysql.createConnection({
            host: h,
            user: u,
            password: pwd,
            database: "securekvpo"
        }));
        this.po = partialOrder;
        if (tbl) {
            this.table = tbl;
        } else {
            this.table = 'kvstore';
        }
    }

    init() {
        const tableSql = `
SHOW TABLES like ?;
        `;

        const createTableSql = `
CREATE TABLE ${this.table} (
    rowkey VARCHAR(256) NOT NULL,
    rowvalues LONGBLOB,
    label VARCHAR(32) NOT NULL,
    PRIMARY KEY (rowkey, label)
);
        `;

        // console.log("** DEBUG: Secure K-V (PO) - Call to init.");
        return this.con.connectAsync()
            // .then(() => console.log("** DEBUG: Secure K-V (PO) - Connection successful."))
            .then(() => this.con.queryAsync(tableSql, [this.table]))
            .then((result) => {
                // console.log("** DEBUG: Secure K-V (PO) - Succeeded getting list of tables.");
                if (result.length === 0) {
                    // console.log("** DEBUG: Secure K-V (PO) - Table does not exists in database. Creating table.");
                    return this.con.queryAsync(createTableSql)
                        // .then(() => console.log("** DEBUG: Secure K-V (PO) - Successfully created table."))
                // } else {
                //     console.log("** DEBUG: Secure K-V (PO) - Table exists in database.");
                }
            })
            .catch((err) => {
                // console.log("** DEBUG: Secure K-V (PO) - Failed init.");
                return bbPromise.reject(err);
            });
    }

    close() {
        // console.log("** DEBUG: Secure K-V (PO) - Call to close.");
        return this.con.endAsync()
            // .then(() => console.log("** DEBUG: Secure K-V (PO) - Connection close successful."))
            .catch(() => {
                // console.log("** DEBUG: Secure K-V (PO) - Failed closing connection.");
                return bbPromise.reject(err);
            });
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
    put (k, v, l) {
        let cond = getCondFromPOTC(this.po.potc, l);

        // console.log("** DEBUG: Secure K-V (PO) - Call to put.");
        // console.log("** DEBUG: Secure K-V (PO) -   Key:   " + k + ".");
        // console.log("** DEBUG: Secure K-V (PO) -   Value: " + v + ".");
        //
        // console.log("** DEBUG: Secure K-V (PO) - Starting transaction.");
        return this.con.beginTransactionAsync()
            // .then(() => console.log("** DEBUG: Secure K-V (PO) - Successfully started transaction."))
            .then(() => this.con.queryAsync(`DELETE FROM ${this.table} WHERE rowkey = ? AND ${cond}`, [k]))
            // .then(() => console.log("** DEBUG: Secure K-V (PO) - Delete successful."))
            .then(() => this.con.queryAsync(`INSERT INTO ${this.table} (rowkey,rowvalues,label) VALUES (?, ?, ?)`, [k,v,l]))
            // .then(() => console.log("** DEBUG: Secure K-V (PO) - Insert successful."))
            .then(() => this.con.commitAsync())
            // .then(() => console.log("** DEBUG: Secure K-V (PO) - Transaction committed successfully."))
            .catch((err) => {
                // console.log("** DEBUG: Secure K-V (PO) - Failed putting value.");
                return bbPromise.reject(err);
            });
    }

    get (k, l) {
        let leLabels = this.po.getAllLE(l);
        const sql = `
SELECT rowvalues, label 
FROM ${this.table} 
WHERE rowkey = ? AND
      label IN ${"('" + [...leLabels].join("', '") + "')"};
    `;

        // console.log("** DEBUG: Secure K-V (PO) - Call to get.");
        // console.log("** DEBUG: Secure K-V (PO) -   Key:   " + k + ".");
        // console.log("** DEBUG: Secure K-V (PO) - Get Query:");
        // console.log(sql);
        // console.log("** DEBUG: Secure K-V (PO) - Get Query /> ");
        return this.con.queryAsync(sql, [k])
            .then((result) => {
                // console.log("** DEBUG: Secure K-V (PO) - Query successful - getting values.");
                // console.log("** DEBUG: Secure K-V (PO) - Query result:");
                // console.log(result);
                // console.log("** DEBUG: Secure K-V (PO) - Query result />");

                return result[0]["rowvalues"];;

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
            })
            .catch((err) => {
                // console.log("** DEBUG: Secure K-V (PO) - Query failed - getting values.");
                return bbPromise.reject(err);
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
    del (k, l) {
        let geLabels = this.po.getAllGE(l);
        const sql = `
DELETE FROM ${this.table}  
WHERE rowkey = ? AND
      label IN ${"('" + [...geLabels].join("', '") + "')"};
    `;

        // console.log("** DEBUG: Secure K-V (PO) - Call to del.");
        // console.log("** DEBUG: Secure K-V (PO) -   Key:   " + k + ".");
        // console.log("** DEBUG: Secure K-V (PO) - Del Query:");
        // console.log(sql);
        // console.log("** DEBUG: Secure K-V (PO) - Del Query /> ");
        return this.con.queryAsync(sql, [k])
            // .then((result) => {
                // console.log("** DEBUG: Secure K-V (PO) - Query successful - deleting value.");
                // console.log("** DEBUG: Secure K-V (PO) - Query result:");
                // console.log(result);
                // console.log("** DEBUG: Secure K-V (PO) - Query result />");
            // })
            .catch((err) => {
                // console.log("** DEBUG: Secure K-V (PO) - Query failed - deleting value.");
                return bbPromise.reject(err);
            });
    }

    keys(l) {
        let leLabels = this.po.getAllLE(l);
        const sql = `
SELECT rowkey, label
FROM ${this.table} 
WHERE label IN ${"('" + [...leLabels].join("', '") + "')"};
    `;

        // console.log("** DEBUG: Secure K-V (PO) - Call to keys.");
        // console.log("** DEBUG: Secure K-V (PO) - Keys Query:");
        // console.log(sql);
        // console.log("** DEBUG: Secure K-V (PO) - Keys Query /> ");
        return this.con.queryAsync(sql)
            .then((result) => {
                // console.log("** DEBUG: Secure K-V (PO) - Query successful - getting keys.");
                // console.log("** DEBUG: Secure K-V (PO) - Query result:");
                // console.log(result);
                // console.log("** DEBUG: Secure K-V (PO) - Query result />");

                return result;
            })
            .catch((err) => {
                // console.log("** DEBUG: Secure K-V (PO) - Query failed - getting keys.");
                return bbPromise.reject(err);
            });
    }

    entries(l) {
        let leLabels = this.po.getAllLE(l);
        const sql = `
SELECT rowkey, rowvalues, label
FROM ${this.table} 
WHERE label IN ${"('" + [...leLabels].join("', '") + "')"};
    `;

        // console.log("** DEBUG: Secure K-V (PO) - Call to entries.");
        // console.log("** DEBUG: Secure K-V (PO) - Entries Query:");
        // console.log(sql);
        // console.log("** DEBUG: Secure K-V (PO) - Entries Query /> ");
        return this.con.queryAsync(sql)
            .then((result) => {
                // console.log("** DEBUG: Secure K-V (PO) - Query successful - getting entries.");
                // console.log("** DEBUG: Secure K-V (PO) - Query result:");
                // console.log(result);
                // console.log("** DEBUG: Secure K-V (PO) - Query result />");

                return result.map(row => ({
                    key: row["rowkey"],
                    val: row["rowvalues"],
                    lab: row["label"],
                }));
            })
            .catch((err) => {
                // console.log("** DEBUG: Secure K-V (PO) - Query failed - getting entries.");
                return bbPromise.reject(err);
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

    const kv = new SecureKV_PO(
        process.argv[3],
        process.argv[4],
        process.argv[5],
        po
    );


    bbPromise.resolve()
        .then(() => console.log("************************"))
        .then(() => console.log("Condition test:"))
        .then(() => console.log(getCondFromPOTC(po.potc, "admin")))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Store Init Test:"))
        .then(() => kv.init())
        .catch((err) => console.log("##### Init Test Error: " + err))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Put Test:"))
        .then(() => kv.entries('top')).then((result) => console.log(result))
        .then(() => kv.put('a', 'value for a', 'admin'))
        .then(() => kv.entries('top')).then((result) => console.log(result))
        .then(() => kv.put('b', 'a value for b', 'bottom'))
        .then(() => kv.entries('top')).then((result) => console.log(result))
        .then(() => kv.put('a', 'another value for a', 'admin'))
        .then(() => kv.entries('top')).then((result) => console.log(result))
        .then(() => kv.put('a', 'less sensitive value for a', 'userA'))
        .then(() => kv.entries('top')).then((result) => console.log(result))
        .then(() => kv.put('a', 'trying a sensitive upgrade', 'top'))
        .then(() => kv.entries('top')).then((result) => console.log(result))
        .catch((err) => console.log("##### Put Test Error: " + err))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Get Test:"))
        .then(() => kv.get('a', 'userA'))
        .then((result) => console.log("Stored value for key a with label 'userA': " + result))
        .then(() => kv.get('b', 'userA'))
        .then((result) => console.log("Stored value for key b with label 'userA': " + result))
        .catch((err) => console.log("##### Get Test Error: " + err))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Keys Test:"))
        .then(() => kv.keys('bottom'))
        .then((result) => console.log("Stored keys for label 'bottom': " + result))
        .then(() => kv.keys('top'))
        .then((result) => console.log("Stored keys for label ,אםפ: " + result))
        .catch((err) => console.log("##### Keys Test Error: " + err))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Entries Test:"))
        .then(() => kv.entries('bottom'))
        .then((result) => console.log("Stored entries for label 'bottom': " + result))
        .then(() => kv.entries('top'))
        .then((result) => console.log("Stored entries for label 'top': " + result))
        .catch((err) => console.log("##### Entries Test Error: " + err))
        .then(() => console.log("************************"))

        .then(() => console.log("**"))

        .then(() => console.log("************************"))
        .then(() => console.log("Delete Test:"))
        .then(() => kv.entries()).then((result) => console.log(result))
        .then(() => kv.del('a', 'top'))
        .then(() => kv.entries()).then((result) => console.log(result))
        .then(() => kv.del('a', 'bottom'))
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