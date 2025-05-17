// Class to track and retrieve usernames
// And cause the "server" code is getting too cluttered

import sharp from "sharp"
import { Heap, LimitedList } from "./DataStructureModule.mjs"
import { ImageBuffer, PixelMeasure } from "./ImageModule.mjs"
import { inRange } from "./Mathy.mjs"
// import { UserNameBinarization, VisualUsername } from "./UsernameBinarization.mjs"
import { iterateN, iterateRN } from "./UtilityModule.mjs"
import { TrackedUsername, VisualUsername } from "./UserModule.mjs"


/**
 * Moving username searcher to separate class
 * Not rewriting the old code as I'm lazy
 */
export class UsernameSearcher {

    static SCORING = {
        PERFECT: 0,
        LIKELY: 2,
        UNLIKELY: 4,
        BAD: 7,
        UNKNOWN: 10,
    }

    static DEFINED_ADJC_SETS = [
        ['o', 'O', '0', 'n'],               // o & rounded set
        ['i', 't', 'r', 'n'],               // r set (flick on r is hard to capture)
        ['i', 'l', '|', 'f', 'L', '1'],     // long char set
        ['a', 'e', 's', 'o', 'g'],          // a set
        ['e', 'c', 'u', 'w'],            // e & curved lt set
        ['o', 'c'],
        ['a', '8', 'B'],    // 8 set
        ['s', 'z'],                 // zigzag lt
        ['R', 'A'],             // Big lt with circle
        ['Y', 'v', 'y'],         // v/w
        ['4', 'd', 'A', 'a'],
        ['d', '9'],
        ['7', 'T'],
        ['g', 'y'],
        ['C', 'G']
    ]
    static ADJC_LETTER_MAP = null
    static PERFORMANCE_MARK_FIND = "find_username"
    static USER_RANK_LIST = 5

    static PreProcess() {
        if (UsernameSearcher.ADJC_LETTER_MAP) return;

        UsernameSearcher.ADJC_LETTER_MAP = new Map();
        // Build adjc map
        for (let arr of UsernameSearcher.DEFINED_ADJC_SETS) {
            const set = new Set(arr)
            for (let lt of arr) {
                const currSet = UsernameSearcher.ADJC_LETTER_MAP.get(lt)
                if (currSet == undefined) UsernameSearcher.ADJC_LETTER_MAP.set(lt, set)
                else { // create new set and combine
                    const combSet = new Set(set)
                    for (const el in currSet) combSet.add(el)
                        UsernameSearcher.ADJC_LETTER_MAP.set(lt, combSet)
                }
            }
        }

        console.debug(`[UsernameSearcher] Generated ${UsernameSearcher.ADJC_LETTER_MAP.size} adjacent entries!`)
    }

    /**
     * 
     * @param {String} searchUsername username to search for
     * @param {TrackedUsername[]} userNameList List of username objects (must have .aliases property)
     * @param {Number} lowestRank Lowest rank to consider, otherwise match is ignored
     * @returns {Array<number, string>} 
     */
    static find (searchUsername, userNameList, lowestRank=Infinity, lowerCasePenalty=true) {
        // Attempt to find the 5 closest usernames to this text
        const sortFunc = (a,b) => a[0] < b[0]
        const usernameRanking = new LimitedList(UsernameSearcher.USER_RANK_LIST, null, sortFunc)
        let currentMax = lowestRank
        // performance.mark(this.PERFORMANCE_MARK_FIND)

        for (const userObj of userNameList) {
            if (!userObj) continue
            for (const userAlias of userObj.aliases) {
                if (userAlias == null) continue;
                const dist = UsernameSearcher.calcLevenDistance(searchUsername, userAlias, currentMax, lowerCasePenalty)
                const userRankObj = [dist, userObj]

                if (usernameRanking.isFull()) currentMax = usernameRanking.sneak()[0]
                if (dist < currentMax) usernameRanking.push(userRankObj)
            }
        }

        // console.debug(`Find username ranking took ${performance.measure('username_mark', this.PERFORMANCE_MARK_FIND).duration.toFixed(2)}ms`)
        return usernameRanking.list
    }

    /**
     * Returns the Leven Distance between two strings
     * @param {string} testUsername Username to test by
     * @param {string} matchUsername Username to match with
     * @param {Number} earlyOut If match-penalty is greater than this value, return early
     * @param {boolean} lowerCasePenalty if true, penalise if matched letter is lower/upper case
     * @returns {Number}
     */
    static calcLevenDistance (testUsername, matchUsername, earlyOut=Infinity, lowerCasePenalty=true) {
        // Return the distance between the two usernames
        const flatArray = new Uint8Array((testUsername.length+1) * (matchUsername.length+1))
        const getOffset = (x,y) => y*(testUsername.length+1) + x

        const del_add_penalty = 2
        for (let x=0; x < testUsername.length+1; x++) {
            flatArray[getOffset(x,0)] = x * del_add_penalty
        }
        for (let y=1; y < matchUsername.length+1; y++) {
            flatArray[getOffset(0,y)] = y * del_add_penalty
        }

        // start DP iteration
        // NOTES: If I want to penalize insertion/deletion, increase cost for left/up movement
        for (let x=1; x<testUsername.length+1; x++) {
            for (let y=1; y<matchUsername.length+1; y++) {
                const penalty = UsernameSearcher.compareLetters(testUsername[x-1], matchUsername[y-1], lowerCasePenalty)                // const penalty = newUsername[x-1] == oldUsername[y-1] ? 0 : 1
                const trip = Math.min(
                                flatArray[getOffset(x-1, y)], 
                                flatArray[getOffset(x-1, y-1)], 
                                flatArray[getOffset(x,   y-1)])
                flatArray[getOffset(x,y)] = penalty + trip
                
                if (x == y && flatArray[getOffset(x,y)] > earlyOut) return Infinity // early out
            }
        }

        return flatArray[getOffset(testUsername.length, matchUsername.length)]
    }

    /**
     * Compare 2 letters
     * @param {string} ltA 
     * @param {string} ltB
     * @param {boolean} [lowerCasePenalty=true] 
     * @returns {boolean}
     */
    static compareLetters(ltA, ltB, lowerCasePenalty=true) {
        
        if (ltA == ltB) return 0
        if (ltA.toLowerCase() == ltB.toLowerCase()) 
            return lowerCasePenalty ? 1 : 0
        
        if ( UsernameSearcher.ADJC_LETTER_MAP.has(ltA) ) {
            if (UsernameSearcher.ADJC_LETTER_MAP.get(ltA).has(ltB)) return 1
        }
        return 2
    }
}
UsernameSearcher.PreProcess()


/**
 * More intensive tracker, that links each username
 */
export class UsernameAllTracker {

    static measuredFPS = 30;
    static BeginExitTime = 176-29;
    static FinishExitTime = 183-29;


    static updateFPSTime (fps) {
        UsernameAllTracker.BeginExitTime *= 30/fps;
        UsernameAllTracker.FinishExitTime *= 30/fps; 
    }

    constructor () {
        /** @type {Map<string, TrackedUsername>} hash of all names */
        this.hash = new Map()       // hash of names
        /** @type {Array<TrackedUsername>} */
        this.usersInOrder = []  // List of UserObj in order

        this.pageIdx = 0           // Currently injested page
        /** @type {UserImage[]} images of the user */
        // this.fullImageList = []     // All images in order

        this.currentScreen = [] // should be max of 24
        this.currentScreenFirstIndex = 0; // first user index on screen
        this.currFrameTime = 0;
    }

    static SCREEN_MAX = 24;

    /**
     * @typedef TrackedUsernamePredictObject
     * @type {object}
     * @property {Array<TrackedUsername} predictedUsers list of predicted UN objects
     * @property {number} offset list shifted by num. If null, list could shift at any time.
     */

    /** Using internal frameTime, predict the shown userboxes based on 
     * input frameTime.
     * @param {number} frameTime current frame being sent
     * @param {Object} amount
     * @prop {number} [amount.totalUsers=null] total users from the top-left corner
     * @prop {boolean} [amount.predictFullScreen=true] assume that all 24 slots are occupied. 
     * This overrides totalUsers and should only be used when totalUsers is obscured
     * @returns {TrackedUsernamePredictObject} List of users & offset
    */
    predict (frameTime, {totalUsers=null, predictFullScreen=true}, setNewUserEnter=true) {

        let startUserIndex = this.currentScreenFirstIndex;
        const screenUsers = []

        // Set expected user amount from input
        let expectedUserAmt = UsernameAllTracker.SCREEN_MAX
        if (!predictFullScreen && totalUsers) {
            expectedUserAmt = Math.min(UsernameAllTracker.SCREEN_MAX, totalUsers)
        }

        let offsetFromCurrent = 0;

        // Iterate names, skipping names that have expired*
        while (screenUsers.length < expectedUserAmt) {
            if (startUserIndex >= this.usersInOrder.length) break;
            const userbox = this.usersInOrder.at(startUserIndex++)
            if (userbox == undefined) { // FIXME: Should never happen
                console.warn("undefined user in list");
                break;
            } 
            // NOTE: Disabling prediction until necessary
            // if (userbox.exitFrameTime <= frameTime) {
            //     offsetFromCurrent++;
            //     continue
            // }
            screenUsers.push(userbox)
        }

        // Now create new users to fill the remaining space
        while (screenUsers.length < expectedUserAmt) {
            const enterTime = setNewUserEnter ? frameTime : null;
            const newUser = new TrackedUsername(enterTime)
            screenUsers.push(newUser);
            // NOTE: Allowing the prediction to create users, as treating the total number as accurate
            this.usersInOrder.push(newUser);
            newUser.index = this.usersInOrder.length - 1;
        }

        // if (offsetFromCurrent == 0 && screenUsers[0]?.exitFrameTime == null) {
        //     offsetFromCurrent = null
        // }
        // NOTE: Overwrite while offset prediction is disabled
        offsetFromCurrent = null;

        return {predictedUsers: screenUsers, offset: offsetFromCurrent }
    }

    /**
     * Finds the best match for 2 lists of users with same length
     * Match minimum is a percentage of the testLength, current 70%
     * @param {TrackedUsername[]} predictedUsers 
     * @param {Object[]} testLenList 
     * @prop {number} [testLenList.vidx]
     * @prop {VisualUsername} [testLenList.vobj]
     */
    static findBestShiftMatch (predictedUsers, testLenList) {

        if (testLenList.length == 0) return {offset:null, goodMatch:false};

        let bestPctMatch = 0;
        let bestOffsetIdx = null;
        const MIN_MATCH = 0.7;

        // NOTE: Possible to get multiple list matches- gotta rely on this being a very low chance
        const st_vidx = testLenList[0].vidx;
        // Remove users with length != null

        for (const pidx of predictedUsers.keys()) {

            const matches = testLenList.map(({vidx, vUser}) => {
                const midx = pidx+vidx-st_vidx;
                if (predictedUsers.length <= midx) return false
                if (predictedUsers[midx].length === null) return undefined
                return predictedUsers[midx].matchLen(vUser.length)
            })
            
            let [tnum, unum] = [0,0]
            for (const bool of matches){
                if (bool == true)   tnum++
                else if (bool == undefined) unum++
            }
            const undefinedMulti = 0.5
            const matchPct = tnum / (testLenList.length - unum * undefinedMulti)
            
            if (bestPctMatch < matchPct) {
                bestPctMatch = matchPct
                bestOffsetIdx = pidx - st_vidx
                if (bestPctMatch > MIN_MATCH) break;
            }
        }

        return {offset:bestOffsetIdx, goodMatch: (bestPctMatch > MIN_MATCH)}
    }

    /**
     * Return true if two significant matches are made, but get 
     * @param {TrackedUsername[]} predictedUsers 
     * @param {Map<number, VisualUsername>} visualUsers
     */
    static findVisualOffset(predictedUsers, visualUsers) {

        if (visualUsers.size == 0) {
            return {offset:null, goodMatch: false}
        }
        // let bestOffsetIdx = null
        /** @type {Map<number, number[]>} length -> [idx] */
        const duplLenTrack = new Map()
        // doing an exact match until I start getting bad hits?
        // I kind of did a quick test for this and it was ok, but the hard test would need extensive data so why bother doing that when I can check for the offset compare to fail first
        for (const [idx, pUser] of predictedUsers.entries()) {
            if (pUser.length !== null) {
                const idxArr = duplLenTrack.get(pUser.length) ?? []
                idxArr.push(idx)
                duplLenTrack.set(pUser.length, idxArr)
            }
        }

        // Get offset shift by checking all lengths
        const offsetList = []
        let duplSortFlag = false;

        for (const [vIdx, vUser] of visualUsers) {
            const pUserIdxArr = duplLenTrack.get(vUser.length)
            if (pUserIdxArr) {
                offsetList.push(pUserIdxArr.map(pUserIdx => pUserIdx - vIdx))
            }
            if (pUserIdxArr?.length > 1) duplSortFlag = true
        }
        if (duplSortFlag) {
            offsetList.sort((a,b) => a.length - b.length)
            for (const idx of iterateRN(offsetList.length)) {
                const offList = offsetList[idx]
                if (offList.length < 2) break
                else offList.sort((a,b) => Math.abs(a) - Math.abs(b)) // sort closer to 0
            }
        }

        if (offsetList.length == 0) {
            return {offsetMatch:null, goodMatch:false}
        }

        // determine offset with a reduce to get elements in every check
        const offsetMatch = offsetList.reduce((pv, cv) => {
            if (pv[0] === null) return [null]

            const mergeSet = new Set();
            for (const el of pv) mergeSet.add(el)
            for (const el2 of cv) {
                if (mergeSet.has(el2)) return [el2]
            }
            return [null] // no match between offsets
        })?.at(0) ?? null

        const goodMatch = (offsetList.length > 1) && (offsetMatch != null)
        return {offsetMatch, goodMatch}
    }

    /**
     * Return true if two edge matches are made
     * @param {TrackedUsername[]} predictedUsers
     * @param {Map<number, VisualUsername>} visualUsers 
     */
    static findColorOffset(predictedUsers, visualUsers) {
        if (visualUsers.size == 0)
            return {offset:null, goodMatch:false}

        const get_val = (user => user.color)
        const matchColor = (colorA, colorB) => {
            return (colorA == null || colorB == null || colorA == colorB)
        }

        const lastIdx = predictedUsers.findLastIndex(pu => pu.color != null)
        const lastColor = predictedUsers[lastIdx].color
        const checkStack = new Set() // no match
        const rVisualUsers = Array.from(visualUsers.entries()).reverse()

        for (const [vidx, vUser] of rVisualUsers) {
            if (vUser.color) {
                for (const checkPt of checkStack) {
                    const pUser = predictedUsers[vidx + checkPt]
                    if (pUser && !matchColor(pUser.color, vUser.color)) {
                        checkStack.delete(checkPt) // its safe to delete during iteration wow
                    }
                }
            }
            if (matchColor(vUser.color, lastColor) && (lastIdx - vidx) >= 0) {
                checkStack.add(lastIdx - vidx)
                // console.log(`Added start index ${Array.from(checkStack.values())}`)
            }
        }

        console.log(`Match set`, checkStack)
        console.log(`Pred   \t${predictedUsers.map(vu => vu.color?.name?.padStart(5, ' ') ?? 'empty').join('|')}`)
        console.log(`Visual?\t${Array.from(visualUsers.values().map(vu => vu.color?.name?.padStart(5, ' ')) ?? 'empty').join('|')}`)

        let [goodMatch, offsetMatch] = [false, null]

        if (checkStack.size > 1) {
            // do edge detection
            const edgeByIndex = UsernameAllTracker.detectEdgesPerIndex(predictedUsers, 
                get_val, matchColor
            )
            // console.log('edge detection', edgeByIndex)
            const sortedIdxs = Array.from(checkStack.values()).sort((a,b) => a-b)
            const [idx1, idx2] = sortedIdxs.slice(0, 2)
            // NOTE: If edge is over a null, could be inaccurate
            // NOTE: while the values should be maxEdges-currEdges, dont need for compare
            goodMatch = !(edgeByIndex[idx1] == edgeByIndex[idx2])
            offsetMatch = idx1
        } else {
            goodMatch = true
            offsetMatch = Array.from(checkStack.values())[0]
        }

        return {goodMatch, offsetMatch}

    }

    /** Detect edges across a function 
     * @param {Array} arr 
     * 
    */
    static detectEdgesPerIndex(arr, 
        get_val=(v => v), 
        compare_func=(v1, v2) => v1 == v2) 
    {
        if (arr.length <= 1) return null;

        let lastVal = get_val(arr[0])
        const retVal = [0]
        let edgeCnt = 0
        for (const val of arr.slice(1)) {
            if (!compare_func(lastVal, get_val(val))) {
                edgeCnt++
            }
            lastVal = get_val(val)
            retVal.push(edgeCnt)
        }

        return retVal
    }

    /**
     * Given a list of predictedUsers, compare the lengths against each other
     * @param {TrackedUsername[]} predictedUsers 
     * @returns {number[][]} [score, idx] list
     */
    static getVIdxToCheckByLen(predictedUsers) {
        // compare each pUser.length against neighbours, giving more weight based on difference
        const scoredLenCheck = []
        /** @type {Map<number, number[]>} list of indexes */
        const duplIndexMap = new Map()
        const duplKeys = new Set()
        for (const [pidx, pUser] of predictedUsers.entries()) {
            if (!pUser.length) {
                scoredLenCheck.push([-100, pidx])
                continue
            }

            const lenArr = duplIndexMap.get(pUser.length) ?? []
            if (lenArr.push(pidx) > 1) duplKeys.add(pUser.length)
            duplIndexMap.set(pUser.length, lenArr)
            
            const leftVal = Math.abs(pUser.length - 
                (predictedUsers[pidx - 1]?.length ?? pUser.length))
            const rightVal = Math.abs(pUser.length - 
                (predictedUsers[pidx + 1]?.length ?? pUser.length))
            
            scoredLenCheck.push([(rightVal+leftVal)/2 + 1, pidx])
        }

        // penalize duplicates
        for (const lenKey of duplKeys) {
            const idxArr = duplIndexMap.get(lenKey)
            if (idxArr.length < 2) continue
            for (const idxKey of idxArr)
                scoredLenCheck[idxKey][0] /= idxArr.length
        }

        return scoredLenCheck.filter(([score, _pidx]) => score > 0).sort((a,b) => b[0]-a[0])
    }


    static getVIdxToCheckByColor(predictedUsers) {
        const scoredColorCheck = []
        
        for (const [pidx, pUser] of predictedUsers.entries()) {
            if (!pUser.color) {
                // scoredColorCheck.push([-100, pidx])
                continue
            }

            const leftVal = pUser.color != predictedUsers[pidx-1]?.color ? 
                1 : 0;
            const rightVal = pUser.color != predictedUsers[pidx+1]?.color ? 
                1 : 0;

            scoredColorCheck.push([rightVal+leftVal, pidx])
        }
        return scoredColorCheck.sort((a,b) => (b[0]-a[0]))
    }

    /**
     * Return fallback offset giving a best case match
     */
    static fallBackOffset(predictedUsers, visibleUsers) {

        // assumption is that 
    }

    /**
     * Given a sparse array, create new users to fill the expected
     * @param {*} sparseUserList
     * @param {number} frameTime 
     * @returns {Array<TrackedUsername>} updated list of users
     * @deprecated
     */
    updateUsers (sparseUserList, frameTime) {
        const startUserIndex = this.currentScreenFirstIndex;

        // TODO: if previous users didnt exist, backtrack
        for (let i=0; i<sparseUserList.length; i++) {
            if (!sparseUserList.at(i) || sparseUserList.at(i)?.appear == false) continue;
            const userAtIndex = startUserIndex + i;
            if (!this.usersInOrder.at(userAtIndex)) {
                this.usersInOrder[userAtIndex] = new TrackedUsername(frameTime);
            }
        }

        return this.usersInOrder.slice(startUserIndex, startUserIndex+sparseUserList.length)
    }

    /**
     * Return username at this position, creating one if empty.
     * Server controls when new names are added
     * @param {number} screenIndex 
     * @returns {TrackedUsername} user at index
     * @deprecated
     */
    genUser (screenIndex) {
        const relIdx = this.currentScreenFirstIndex + screenIndex
        if (!this.usersInOrder.at(relIdx))
            this.usersInOrder[relIdx] = new TrackedUsername(null)
        return this.usersInOrder.at(relIdx)
    }

    /**
     * Move offset (must be positive)
     * @param {number} positiveShift 
     * @param {number} currFrame current frame
     */
    shiftOffset (positiveShift, currFrame = null) {
        if (currFrame) {
            for (const shift of iterateN(positiveShift)) {
                this.usersInOrder[this.currentScreenFirstIndex + shift].debugExitFrame = currFrame
            }
        }
        this.currentScreenFirstIndex += positiveShift;
    }

    /**
     * Retrieve the best image for this username
     * @param {string} username 
     * @returns {ArrayBuffer} JPG buffer of image
     */
    getImage(username) {
        if (this.hash.has(username)) {
            const userObj = this.hash.get(username)
            const imgObj = userObj.bestImg
            return imgObj
        }
        return null
    }

    /**
     * Get image by index for testing*
     * @param {number} userIndex 
     * @returns {ArrayBuffer} JPG of buffer image if possible
     */
    getImageByIndex(userIndex) {
        return this.usersInOrder[userIndex]?.bestImg
    }

    updateHash(username, userobj) {
        this.hash.set(username, userobj)
    }

    /**
     * Find approx username
     */
    find (username, lowestRank=Infinity) {
        return UsernameSearcher.find(username, this.usersInOrder, lowestRank, true)
    }

    /** Clears the usernames and hash */
    clear() {
        this.usersInOrder = [];

        this.hash.clear()
    }

    /**
     * Returns a list that is human readable for debugging
     */
    getReadableList () {
        return this.usersInOrder.map(username => username.toJSON())
    }

    get count() {
        const lastFoundIndex = this.usersInOrder.findLastIndex(tUser => tUser.length != null)
        return lastFoundIndex
    }

    get knownCount() {
        const namedUsers = this.usersInOrder.filter(user => user.name != null)
        return namedUsers
    }

    status () {
        return {
            'user_count': this.count,
            'recognized_users': this.knownCount,
            'read_pages': this.read_imgs,
            'unverified': {
                'users': this.usersInOrder.map(user => user?.name != null)
            }
        }
    }
}