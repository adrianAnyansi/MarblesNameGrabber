// Fetch the program
// let UsernameList = []
const serverURL = 'http://localhost:4000'

let UsernameHash = new Map()
const userNext = 1_000 * 10;
const userOffset = 1_000 * 4;
const EMPTY_IMG = "data:,"

let TrackingUsername = ''
let userInputQueueBool = false

const UsernameInputEl = document.getElementById('username_input')
const UsernameOutputEl = document.getElementById('username_simple_out')
const UsernameGeneral = document.getElementById('username_general')
const UserImgEl = document.getElementById('userImg')

const ServerStatusEl = document.getElementById('server_status')
const ServerUsersEl = document.getElementById('user_tracked')
const WebsiteUsersEl = document.getElementById('viewers_visiting')


function fetchServerStatus () {
    fetch(`${serverURL}/status`)
    .catch( resp => {
        // ◗
        ServerStatusEl.textContent = `◉ Offline.`
        setTimeout(fetchServerStatus, 1_000 * 15) // retry
        return Promise.reject('offline server, try again much later')
    })
    .then(resp => resp.json())
    .then( serverJSON => {
        handleServerStatus(serverJSON)
        setTimeout(fetchServerStatus, 1_000*3) // retry
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

const USER_INPUT_DELAY = 1_000 * 2;
let inputTimeout = 0;

/** Queue input after 2 seconds of no input */
function queueInput(inputEvent) {
    UsernameOutputEl.textContent = '...'
    userInputQueueBool = true
    clearInterval(inputTimeout)
    inputTimeout = setTimeout(handleInput, USER_INPUT_DELAY, inputEvent)
}


const MATCH_RET = ['YES!', 'Probably', 'Maybe', 'Unlikely', 'No Match']

/**
 * Trigger search query to server
 * @param {InputEvent} inputEvent 
 */
function handleInput (inputEvent) {
    
    const username = UsernameInputEl.value.trim()
    if (TrackingUsername == username) {
        // early-out IF server has not been updated & user not found
        // console.debug("Redoing already tracked name")
    }

    if (username == '') return
    if (username.length < 3) UsernameOutputEl.textContent = 'Please enter more than 3 characters'

    TrackingUsername = username

    try {
        // Setup UI stuff if user initiated    
        if (userInputQueueBool) {
            UserImgEl.src = EMPTY_IMG
            UserImgEl.classList.add('hidden')
            UsernameOutputEl.textContent = 'Finding username...'
            userInputQueueBool = false
        }
        
        fetch(`${serverURL}/user_find/${username}`)
        .then( res => res.json() )
        .then( userFindJSON => {
            UsernameOutputEl.textContent = MATCH_RET[userFindJSON['match']] ?? MATCH_RET.at(-1)
            
            if (userFindJSON['userObj']) {
                UsernameOutputEl.textContent += `\nFound ${userFindJSON['userObj']['name']}`
                
                // if (UserImgEl.src == EMPTY_IMG) {
                UserImgEl.src = `${serverURL}/fullImg/${userFindJSON['userObj']['fullImgIdxList'][0]}`
                UserImgEl.classList.remove('hidden')
                // }
            }
        })
        inputTimeout = setTimeout(handleInput, USER_INPUT_DELAY, inputEvent)
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
    ServerStatusEl.textContent = `${serverJSON['status']}`
    ServerUsersEl.textContent = `${serverJSON['userList']['user_list']} found user(s)`
    WebsiteUsersEl.textContent = `1 site viewers` // TODO: Finish
}

function setupPage() {
    fetchServerStatus()
    UsernameInputEl.addEventListener('input', queueInput)
    if (UsernameInputEl.value) handleInput()
    // fetchUserList()
}

setupPage()