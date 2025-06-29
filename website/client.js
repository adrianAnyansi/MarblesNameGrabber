// Fetch the program
// const serverURL = 'http://localhost:4000'
const serverURL = ''

const UsernameHash = new Map()
const userNext = 1_000 * 10;
const userOffset = 1_000 * 4;
const EMPTY_IMG = "data:,"

let TrackingUsername = ''
let FoundUsername = null
let userInputQueueBool = false

let userCheckingStatusInterval = null

const UsernameInputEl = document.getElementById('username_input')
const UsernameOutputEl = document.getElementById('username_feedback')
// const UsernameGeneral = document.getElementById('username_general')
const UsernameRecheck = document.getElementById('username_recheck')
const UsernamePlaceholder = document.getElementById('username_placeholder')

const UserImgEl = document.getElementById('userImg')
const UserImgDivEl = document.getElementById('userImgDiv')
const UserImgSimUsers = document.getElementById('simUsers')
const UserMatchQuality = document.getElementById('match_quality')
const UserMatchText = document.getElementById('match_text')

const ServerStatusEl = document.getElementById('server_status')
const ServerUsersEl = document.getElementById('user_tracked')
const ServerStatusIcon = document.getElementById('serverStatusIcon')
const ServerStatusDetails = document.getElementById('ServerStatusDetails')
const ServerStartTime = document.getElementById('ServerStartTime')
const ServerEndTime = document.getElementById('ServerEndTime')
const LagTimeEl = document.getElementById('lag_time')

const WebsiteUsersEl = document.getElementById('viewers_visiting')
const totalViewerEl = document.getElementById('total_viewer')

const Screen_Feedback = document.getElementById('screen_demo')

const trackedUserNums = [0, 0]
const visitingUserNums = [0, 0]

// page and admin setup
const adminEl = document.getElementById('Admin_header')
const queryParams = new URLSearchParams(window.location.search)
document.getElementById('force_btn').addEventListener('click', () => fetch(`${serverURL}/force`))
document.getElementById('stop_btn').addEventListener('click', () => {
    fetch(`${serverURL}/stop`, {method: 'POST'})
})

if (queryParams.has('admin')) {
    adminEl.classList.add('show')
    adminEl.querySelector('#admin').classList.add('show')
}
if (location.host.includes('localhost') || location.host.includes('127.0.0.1')) {
    
    adminEl.classList.add('show')
    adminEl.querySelector('#debug').classList.add('show')
}

// ==================
const OFFLINE_STATUS_MS =  1_000 * 15;
const DEFAULT_STATUS_MS = 1_000 * 6;
function fetchServerStatus () {
    const adminString = queryParams.has("admin") ? "?admin" : ""
    fetch(`${serverURL}/status${adminString}`)
    .catch( resp => {
        // ◗
        ServerStatusEl.textContent = `Offline.`
        ServerStatusIcon.classList = "circle_icon"
        setTimeout(fetchServerStatus, OFFLINE_STATUS_MS) // retry
        return Promise.reject('offline server, try again much later')
    })
    .then(resp => resp.json())
    .then( serverJSON => {
        handleServerStatus(serverJSON)
        let nextInterval = DEFAULT_STATUS_MS
        if (queryParams.has('admin'))
            nextInterval = 50;
        else
            nextInterval = serverJSON['status']['interval'] ?? nextInterval 
        setTimeout(fetchServerStatus, nextInterval) // retry
    })
    .catch( err => {
        console.log("Error occurred, return", err)
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
const USER_FIRST_INPUT_DELAY = 1_000 * 1.5; // delay to search after letter
let handleInputTimeout = null;
let delayTimeout = null;

/**
 * Add a dot to the end on interval to show processing
 */
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
        clearInterval(userCheckingStatusInterval) // clear user check
        userCheckingStatusInterval = null
        clearInterval(handleInputTimeout) // clear previous queue input
        clearInterval(delayTimeout) // clear feedback delay timeout
        UsernameRecheck.textContent = "" // TODO: Move clearing username output into function?
        handleInputTimeout = null
        return
    }
    UsernameOutputEl.className = ``
    userInfoInterval('Checking input')

    userInputQueueBool = true
    clearInterval(handleInputTimeout)
    clearInterval(delayTimeout)
    UsernameRecheck.textContent = ""
    handleInputTimeout = setTimeout(handleInput, USER_FIRST_INPUT_DELAY, inputEvent)
}


const MATCH_RET = ['Match!', 'Very Likely', 'Maybe', 'Unlikely', 'No Match']

/**
 * Trigger search query to server
 * @param {InputEvent} inputEvent 
 */
function handleInput (inputEvent) {

    clearInterval(userCheckingStatusInterval)
    userCheckingStatusInterval = null
    UsernameRecheck.textContent = ""
    
    const username = UsernameInputEl.value.trim()
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
        
        fetch(`${serverURL}/find/${username}`)
        .then( res => res.json() )
        .then( userFindJSON => handleUserJSON(userFindJSON)
    )


        // TODO: Fix this - save the server state correctly
        if ( !(['STOPPED', 'COMPLETE'].includes(ServerStatusEl.textContent) || // server status is stopped or complete
                FoundUsername == UsernameInputEl.value )) {      // OR returned name == username
        // if (true) {
                handleInputTimeout = setTimeout(handleInput, USER_INPUT_DELAY, inputEvent)
                
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

function handleUserJSON(userFindJSON) {
    clearInterval(userCheckingStatusInterval)
    userCheckingStatusInterval = null
    const srchList = userFindJSON['srchList']['list']

    UserImgDivEl.classList.toggle('visible', srchList.length > 0)
    if (!srchList || srchList.length == 0) {
        UserImgSimUsers.textContent = ''
        UsernameOutputEl.textContent = 'No results'
    } else {
    
        const {_dist, userObj, matchStatus} = srchList[0]
        const {name, index} = userObj
        UsernameOutputEl.textContent = `Found [${srchList.length}] matches`
    // if (userObj) {
        UserImgEl.src = `${serverURL}/idx_img/${index}`
        UserMatchQuality.textContent = `${matchStatus}`
        UserMatchQuality.classList.value = ''
        UserMatchQuality.classList.add(matchStatus)
        UserMatchText.textContent = `${name}`
        console.log(userFindJSON)
        UserImgSimUsers.textContent = `Similar names: 
            ${srchList.slice(1).map(({userObj, matchStatus}) => `[${userObj['name']}: ${matchStatus}]`).join(',')}`
        FoundUsername = name
    }
}

/**
 * Handle server JSON by displaying/editing certain elements after retrieval
 * @param {object} serverJSON - JSON from server status
**/
function handleServerStatus(serverJSON) {
    // Assume serverJSON is valid
    ServerStatusEl.textContent = `${serverJSON['status']['state']}`
    ServerStatusIcon.classList = [serverJSON['status']['state'].toLowerCase(), 'circle_icon'].join(' ')
    const viewerCount = parseInt(serverJSON['status']['viewers'])
    ServerStatusDetails.textContent = `${serverJSON['status']['state_desc']}`
    
    WebsiteUsersEl.textContent = `${viewerCount} viewer${viewerCount > 1 ? 's':' (thats you!)'}`
    totalViewerEl.textContent = `${serverJSON['status']['unique_viewers']} total visitor${viewerCount > 1 ? 's':''}`

    if (serverJSON['lag_time'])
        LagTimeEl.textContent = `Name recognition: +${(serverJSON['lag_time'] / 1000).toFixed(2)}s from LIVE`

    if (serverJSON['screen_state']) {
        handleScreenState(serverJSON['screen_state'], 
            serverJSON['appear_state'],
            serverJSON['visible_lens'])
    }
    
    if (serverJSON['status']['marbles_start_ts']) {
        ServerStartTime.textContent = `${new Date(serverJSON['status']['marbles_start_ts']).toLocaleString()}`
    }
    ServerStartTime.parentElement.classList.toggle("hidden", !serverJSON['status']['marbles_start_ts'])
    if (serverJSON['status']['marbles_end_ts']) {
        ServerEndTime.textContent = `${new Date(serverJSON['status']['marbles_end_ts']).toLocaleString()}`
    }
    ServerEndTime.parentElement.classList.toggle("hidden", !serverJSON['status']['marbles_end_ts'])
    
    let dialingTracked = trackedUserNums[0] != trackedUserNums[1] // tracked is being moved already
    trackedUserNums[1] = serverJSON['users']['namedCount']
    if (!dialingTracked)
        dialNumber(trackedUserNums, ServerUsersEl, '# tracked user(s)')
    
}

const ScreenStateDisplay = document.getElementById("screen_demo")
const ScreenStateNames = ScreenStateDisplay.querySelectorAll('.name')
const NAME_LEGEND = {
    'S': 'seen',
    'L': 'seen',
    'O': 'processing',
    'N': 'named',
    '*': 'unknown'
}
const maxUNWidth = -294;
const UNScale = 0.2;
function handleScreenState(screenState, appearState, userLens) {
    ScreenStateDisplay.classList = '' // remove none class
    for (const [idx, nameEl] of ScreenStateNames.entries()) {
        nameEl.classList = `name ${NAME_LEGEND[screenState[idx]]}`
        if (appearState)
            nameEl.classList.toggle('dashed_bg', appearState[idx] == '?')
        if (userLens)
            nameEl.style.width = `${100 * (userLens[idx] ?? maxUNWidth) /maxUNWidth}%`
    }
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