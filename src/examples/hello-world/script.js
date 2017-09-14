/* *******************************************
 *   Function APIs
 */
identity = {
    put : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/store",
    get : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/retrieve"
};
unsafe = {
    put : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/store",
    get : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/retrieve"
};
total = {
    put : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/store",
    get : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/retrieve"
};
partial = {
    put : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/store",
    get : "https://xarygspldj.execute-api.us-west-1.amazonaws.com/helloWorld/identity/retrieve"
};

/* *******************************************
*   Tab Code
*/

function doStoreAction(keyId, valueId, outId, api) {

    let request = new XMLHttpRequest();
    let reqKey = document.getElementById(keyId).value;
    let reqVal = document.getElementById(valueId).value;

    request.onreadystatechange = function () {

        if (request.readyState === 4 && request.status === 200) {
            document.getElementById(outId).innerHTML = request.responseText
        }
    };

    request.open("POST", api.put, true);
    request.setRequestHeader('Content-Type', 'application/json');
    request.send(JSON.stringify({
        key: reqKey,
        val: reqVal
    }));
}
function doRetrieveAction(keyId, outId, api) {

    let request = new XMLHttpRequest();
    let reqKey = document.getElementById(keyId).value;

    request.onreadystatechange = function () {

        if (request.readyState === 4 && request.status === 200) {
            document.getElementById(outId).innerHTML = request.responseText
        }
    };

    request.open("POST", api.get, true);
    request.setRequestHeader('Content-Type', 'application/json');
    request.send(JSON.stringify({
        key: reqKey
    }));
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
