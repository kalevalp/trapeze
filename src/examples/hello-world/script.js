/* *******************************************
 *   Function APIs
 */
identity = {
    put : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/store",
    get : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/retrieve",
    has : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/contains"
};
unsafe = {
    put : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/no-sec/store",
    get : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/no-sec/retrieve",
    has : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/no-sec/contains"
};
total = {
    put : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/total-order/store",
    get : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/total-order/retrieve",
    has : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/total-order/contains"
};
partial = {
    put : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/partial-order/store",
    get : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/partial-order/retrieve",
    has : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/partial-order/contains"
};

/* *******************************************
*   Button handler Code
*/

function doStoreAction(keyId, valueId, outId, api, userId, passId) {

    let request = new XMLHttpRequest();
    let reqKey = document.getElementById(keyId).value;
    let reqVal = document.getElementById(valueId).value;
    let requestJson = {
        key: reqKey,
        value: reqVal
    };
    if (userId !== undefined && passId !== undefined) {
        let reqUser = document.getElementById(userId).value;
        let reqPass = document.getElementById(passId).value;

        requestJson.user = reqUser;
        requestJson.pass = reqPass;
    }
    request.onreadystatechange = function () {

        if (request.readyState === 4 && request.status === 200) {
            document.getElementById(outId).innerHTML = request.responseText
        }
    };

    request.open("POST", api.put, true);
    request.setRequestHeader('Content-Type', 'application/json');
    request.send(JSON.stringify(requestJson));
}

function doRetrieveAction(keyId, outId, api, userId, passId) {

    let request = new XMLHttpRequest();
    let reqKey = document.getElementById(keyId).value;
    let requestJson = {
        key: reqKey
    };
    if (userId !== undefined && passId !== undefined) {
        let reqUser = document.getElementById(userId).value;
        let reqPass = document.getElementById(passId).value;

        requestJson.user = reqUser;
        requestJson.pass = reqPass;
    }

    request.onreadystatechange = function () {

        if (request.readyState === 4 && request.status === 200) {
            document.getElementById(outId).innerHTML = request.responseText
        }
    };

    request.open("POST", api, true);
    request.setRequestHeader('Content-Type', 'application/json');
    request.send(JSON.stringify(requestJson));
}

function clearElements(...elements) {
    for (let elem of elements) {
        document.getElementById(elem).innerHTML = "";
    }
}

/* *******************************************
 *   Tab Code
 */

function openExample(evt, cityName) {
    // Declare all variables
    let i, tabcontent, tablinks;

    // Get all elements with class="tabcontent" and hide them
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // Get all elements with class="tablinks" and remove the class "active"
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(cityName).style.display = "block";
    evt.currentTarget.className += " active";
}
