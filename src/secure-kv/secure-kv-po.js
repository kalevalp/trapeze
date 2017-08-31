const mysql = require('mysql');

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
    PRIMARY KEY (rowkey)
);
            `;
            this.con.query(createTableSql, function (err, result) {
                if (err) callback(err);
                // console.log(result);
            });

            const cond = getCondFromPOTC(this.po);

            const addUpdateTrigger = `
DELIMITER $$
CREATE TRIGGER PO_put_semantics BEFORE UPDATE ON ? 
    FOR EACH ROW
    BEGIN
        IF ? THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Security policy violation: Attempt to perform a sensitive upgrade (PO semantics).';
        END IF;
    END;
$$
DELIMITER ;
`;
            this.con.query(addUpdateTrigger, ['kvstore', cond], function (err, result) {
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
        rowvalues=VALUES(rowvalues), label=VALUES(label);
        `;

        this.con.query(sql,[k,v,l], function (err, result) {
            if (err) callback(err);
            // console.log(result);
        });
    }
    
    get (k, l, callback) {
        const sql = `
SELECT rowvalue 
FROM kvstore 
WHERE rowkey = ? AND
      label IN ?;
    `;

        con.query(sql, [k,"(" + [...this.po[l]].join(", ") + ")"], function (err, result) {
            if (err) callback(err);
            if (result.length === 0) callback(null,"");
            else {
                callback(null, result.map(function (r) {
                    return r["rowvalue"];
                }));
            }
        });
    }

}

module.exports.SecureKV_PO = SecureKV_PO;

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
    return "(" +
        Object.keys(potc).map(function (x) {
            return "NEW.label = " + x + " AND OLD.label NOT IN (" + [...potc[x]].join(", ") + ")";
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