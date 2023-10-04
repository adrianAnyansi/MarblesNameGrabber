// Fetch the program
// const serverURL = 'http://localhost:4000'
const serverURL = ''

let UsernameHash = new Map()
const userNext = 1_000 * 10;
const userOffset = 1_000 * 4;
const EMPTY_IMG = "data:,"

let TrackingUsername = ''
let FoundUsername = null
let userInputQueueBool = false

let userCheckingStatusInterval = null

const UsernameInputEl = document.getElementById('username_input')
const UsernameOutputEl = document.getElementById('username_simple_out')
const UsernameGeneral = document.getElementById('username_general')
const UsernameRecheck = document.getElementById('username_recheck')
const UsernamePlaceholder = document.getElementById('username_placeholder')
const UserImgEl = document.getElementById('userImg')

const ServerStatusEl = document.getElementById('server_status')
const ServerUsersEl = document.getElementById('user_tracked')
const WebsiteUsersEl = document.getElementById('viewers_visiting')

const trackedUserNums = [0, 0]
const visitingUserNums = [0, 0]


if (location.host.includes('localhost') || location.host.includes('127.0.0.1')) {
    document.body.prepend('DEBUG')
}

// ==================

function fetchServerStatus () {
    fetch(`${serverURL}/status`)
    .catch( resp => {
        // ◗
        ServerStatusEl.textContent = `Offline.`
        setTimeout(fetchServerStatus, 1_000 * 15) // retry
        return Promise.reject('offline server, try again much later')
    })
    .then(resp => resp.json())
    .then( serverJSON => {
        handleServerStatus(serverJSON)
        const nextInterval = serverJSON['status']['interval'] ?? 1_000 * 6
        setTimeout(fetchServerStatus, nextInterval) // retry
    })
    .catch( err => {
        console.log("Error occurred, return")
        return
    })
}

function fetchUserList () {
    fetch(`${serverURL}/list`)
    .then(resp => resp.json())
    .then( UserJson => {
        console.log(UserJson)
        UsernameHash.clear()
        for (let user in UserJson) {
            UsernameHash.set(user, UserJson[user])
        }
        // UsernameHash = new Map(Object.entries(UserJson)) // TODO: convert to Map
    })
    setTimeout(fetchUserList, Math.random()*userOffset + userNext)
}

const USER_INPUT_DELAY = 1_000 * 6;
const USER_FIRST_INPUT_DELAY = 1_000 * 2;
let inputTimeout = null;
let delayTimeout = null;

function userInfoInterval(default_text, default_elem=UsernameOutputEl) {
    default_elem.textContent = `${default_text}`+''.padEnd(3, '.')
    let dotNum = 0
    if (userCheckingStatusInterval == null) {
        userCheckingStatusInterval = setInterval( () => {
            dotNum = (dotNum + 1) % 4
            default_elem.textContent = `${default_text}`+''.padEnd(dotNum, '.')
        }, 1_000)
    }
}

/** Queue input after 2 seconds of no input */
function queueInput(inputEvent) {
    
    if (UsernameInputEl.value.trim() == "") {
        UsernameOutputEl.textContent = ""
        clearInterval(userCheckingStatusInterval)
        userCheckingStatusInterval = null
        clearInterval(inputTimeout)
        clearInterval(delayTimeout)
        UsernameRecheck.textContent = "" // TODO: Move clearing username output into function?
        inputTimeout = null
        return
    }
    UsernameOutputEl.className = ``
    userInfoInterval('Checking input')

    userInputQueueBool = true
    clearInterval(inputTimeout)
    clearInterval(delayTimeout)
    UsernameRecheck.textContent = ""
    inputTimeout = setTimeout(handleInput, USER_FIRST_INPUT_DELAY, inputEvent)
}


const MATCH_RET = ['Match!', 'Probably', 'Maybe', 'Unlikely', 'No Match']

/**
 * Trigger search query to server
 * @param {InputEvent} inputEvent 
 */
function handleInput (inputEvent) {

    clearInterval(userCheckingStatusInterval)
    userCheckingStatusInterval = null
    UsernameRecheck.textContent = ""
    
    const username = UsernameInputEl.value.trim()
    UsernamePlaceholder.classList.add('hidden')

    if (username == '') {
        UsernamePlaceholder.classList.remove('hidden')
        return
    }
    if (username.length < 3) {
        UsernameOutputEl.textContent = 'Please enter more than 3 characters'
        return
    }

    TrackingUsername = username // set global

    try {
        // Setup UI stuff if user initiated    
        if (userInputQueueBool) {
            UserImgEl.src = EMPTY_IMG
            UserImgEl.classList.add('hidden')
            userInfoInterval('Finding username')
            userInputQueueBool = false
        }
        
        fetch(`${serverURL}/user_find/${username}`)
        .then( res => res.json() )
        .then( userFindJSON => {
            
            clearInterval(userCheckingStatusInterval)
            userCheckingStatusInterval = null
            UsernameOutputEl.textContent = MATCH_RET[userFindJSON['match']] ?? MATCH_RET.at(-1)
            if (MATCH_RET[userFindJSON['match']]) {
                UsernameOutputEl.className = `_${userFindJSON['match']}`
            }
            
            if (userFindJSON['userObj']) {
                // UsernameOutputEl.textContent += `\nFound ${userFindJSON['userObj']['name']}`
                
                // if (UserImgEl.src == EMPTY_IMG) {
                UserImgEl.src = `${serverURL}/fullImg/${userFindJSON['userObj']['fullImgIdxList'][0]}`
                UserImgEl.classList.remove('hidden')
                FoundUsername = userFindJSON['userObj']['name']
                // }
            }
        })


        
        if ( !(['STOPPED', 'COMPLETE'].includes(ServerStatusEl.textContent) || // server status is stopped or complete
                FoundUsername == UsernameInputEl.value )) {      // OR returned name == username
        // if (true) {
                inputTimeout = setTimeout(handleInput, USER_INPUT_DELAY, inputEvent)
                
                { // block to keep the temp variable
                    let delaySecs = parseInt(USER_INPUT_DELAY / 1000)
                    const delayFunc = () => {
                        delaySecs -= 1
                        UsernameRecheck.textContent = `recheck in ${delaySecs}s`
                        if (delaySecs >= 1)
                            delayTimeout = setTimeout(delayFunc, 1000)
                        else 
                            UsernameRecheck.textContent = ""
                    }
                    delayFunc()
                }
            }
        
    } catch (e) {
        console.warn("Error happened, sorry", e)
    }
}

/**
 * Handle server JSON by displaying/editing certain elements after retrieval
 * @param {object} serverJSON - JSON from server status
**/
function handleServerStatus(serverJSON) {
    // Assume serverJSON is valid
    ServerStatusEl.textContent = `${serverJSON['status']['state']}`
    document.querySelector('#serverStatusIcon').classList = serverJSON['status']['state'].toLowerCase()
    // ServerUsersEl.textContent = `${serverJSON['userList']['user_list']} possible user(s)`
    WebsiteUsersEl.textContent = `${serverJSON['status']['viewers']} site viewer(s)` // TODO: Finish
    
    let dialingTracked = trackedUserNums[0] != trackedUserNums[1] // tracked is being moved already
    trackedUserNums[1] = serverJSON['userList']['user_list']
    if (!dialingTracked)
        dialNumber(trackedUserNums, ServerUsersEl, '# possible user(s)')
    
}

/**
 * Dial number from numArr or down. Making a custom timer ala Pokemon so it scales
 */
function dialNumber (numArr, textElem, textContent='#') {
    if (numArr[1] == numArr[0]) {
        textElem.textContent = textContent.replace('#', numArr[0]) // set twice
        return
    }
    
    let dir = numArr[1] - numArr[0] > 0 ? 1 : -1
    if ( Math.abs(numArr[1] - numArr[0]) > 500 ) numArr[0] = numArr[1]//+= dir * 10

    numArr[0] += dir
    textElem.textContent = textContent.replace('#', numArr[0])
    
    // queue next change
    const diff = Math.abs(numArr[1] - numArr[0])
    let nextTime = (diff > 200) ? 3 : 3 + parseInt(((200 - diff)**1.5) / (200**1.5/80)) // 400 seems like a good max
    setTimeout( () => dialNumber(numArr, textElem, textContent), nextTime)
}



/** Set up the connections and etc */
function setupPage() {
    fetchServerStatus()
    UsernameInputEl.addEventListener('input', queueInput)
    if (UsernameInputEl.value) handleInput() // trigger search if browser has cached the user input
    // fetchUserList()
}

setupPage()