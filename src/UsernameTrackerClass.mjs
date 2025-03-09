// Class to track and retrieve usernames
// And cause the "server" code is getting too cluttered

// export default {UsernameTracker, Heap}
// export {UsernameTracker, Heap}

import sharp from "sharp"
import { LimitedList } from "./DataStructureModule.mjs"
import { PixelMeasure } from "./UtilModule.mjs"
import { UserNameBinarization } from "./UserNameBinarization.mjs"

class Username {
    /**
     * Store info about the Username and etc
     * @param {String} name Username string
     * @param {Number} confidence confidence percentage
     * @param {Number} index Index in the full 1000 list
     * @param {Date} timestamp Ingest date
     */
    constructor (name, confidence, index, timestamp=null) {
        /** @type {string} most confident name */
        this.name = name                
        /** @type {number} confidence percentage */
        this.confidence = confidence
        /** @type {number} index in user list */
        this.index = index
        
        /** @type {number} ingest timestamp in ms */
        this.timestamp = timestamp      
        this.verifyAmount = 0           // verified by human
        /** @type {UserImage<>} images of the user */
        this.fullImgIdxList = []       

        /** @type {Set<string>} set of usernames that are at this index */
        this.aliases = new Set()
    }
}

class UserImage {
    /**
     * Object for storing Images and corresponding info
     * @param {*} pageIdx Which ingested page its on
     * @param {*} division Where on page its located
     * @param {*} buffer JPEG buffer
     * @param {*} userObj Link to username object
     */
    constructor (pageIdx, division, buffer, userObj) {
        this.pageIdx = pageIdx      // page captured
        this.division = division    // division on that page
        this.imgBuffer = buffer     // image object
        this.userObj = userObj      // link to userObj
    }
}

// TODO: Maybe put this in class
const DEFINED_ADJC_SETS = [
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
const ADJC_LETTER_MAP = new Map()

for (let arr of DEFINED_ADJC_SETS) {
    let set = new Set(arr)
    for (let lt of arr) {
        let currSet = ADJC_LETTER_MAP.get(lt)
        if (currSet == undefined) ADJC_LETTER_MAP.set(lt, set)
        else { // create new set and combine
            const combSet = new Set(set)
            for (const el in currSet) combSet.add(el)
            ADJC_LETTER_MAP.set(lt, combSet)
        }
    }
}

console.debug(`[UsernameTracker] Generated ${ADJC_LETTER_MAP.size} adjacent entries!`)



export class UsernameTracker {

    constructor () {
        this.hash = new Map()       // hash of names
        /** @type {Array<Username>} */
        this.usersInOrder = []  // List of UserObj in order

        this.pageIdx = 0           // Currently injested page
        /** @type {UserImage[]} images of the user */
        this.fullImageList = []     // All images in order

        this.unverifiedImgs = []    // List of usernames unsuccessfully read
        this.unverifiedUsers = new Set()   // Users yet to be verified

        this.lastPage = []      // Users on the last page
    }

    get length () {
        // return this.hash.size
        return this.usersInOrder.length
    }

    /**
     * Add username to userInOrder with object
     * @param {string} username 
     * @param {number} confidence 
     * @param {number} index 
     * @param {Date} capture_dt
     * @returns {Username}
     */
    add (username, confidence, index, capture_dt) {
        let userObj = this.usersInOrder.at(index)

        if (!userObj) {
            userObj = new Username(username, confidence, index, capture_dt)
            userObj.aliases.add(username)
            this.hash.set(username, userObj)
            this.usersInOrder[index] = userObj
        } else { // add alias
            userObj.aliases.add(username)
            this.hash.set(username, userObj)
            // if confidence higher, update userObj
            if (confidence > userObj.confidence ) {
                userObj.confidence = confidence
                userObj.name = username
            }
        }
        return userObj
    }

    /**
     * Deprecated (hash version of user)
     * @deprecated
     * @param {*} username 
     * @param {*} confidence 
     * @param {*} userVerify 
     * @returns 
     */
    addOld (username, confidence, userVerify=false) {
        let userObj = this.hash.get(username)

        if (userObj == undefined) {
            userObj = new Username(username, confidence)
            this.hash.set(username, userObj)

        } else {    // update confidence
            userObj.confidence = Math.max(confidence, userObj.confidence)

            if (userVerify) userObj.verifyAmount += 1
            else if (userObj.verifyAmount < 1)  userObj.verifyAmount = 1
        }
        
        return userObj
    }

    /**
     * Deprecated, no longer manually removing usernames
     * @deprecated
     * @param {*} username 
     * @returns 
     */
    remove(username) {
        if (!this.hash.has(username)) return null
        
        const user = this.hash.get(username)
        this.hash.delete(username)
    }

    rename(oldUsername, newUsername) {
        if (!this.hash.has(oldUsername)) return null

        const user = this.hash.get(oldUsername)
        this.hash.delete(oldUsername)
        this.add(newUsername, user.confidence, true)

        this.hash.set(newUsername, img) // maybe don't replace old one?
    }

    // TODO: Move to constants
    USERNAME_BOX_HEIGHT_PCT  = ((185+1) - 152) / 1080; // username max box height
    // USERNAME_BOX_HEIGHT = ((185+1) - 152) / 1080
    OCR_SCALE_RATIO = 1000 / 547;
    USERNAME_FULL_BOX_HEIGHT_PCT = (1080-154)/1080
    USERNAME_BOX_CROP_PCT = this.USERNAME_BOX_HEIGHT_PCT / this.USERNAME_FULL_BOX_HEIGHT_PCT

    MIN_PAGE_CHECK = 1  // At least # usernames must exist for this page to be checked

    static USER_IMG_LIMIT = 3

    /**
     * Add a page of usernames (including scrubbing to check which line is which)
     * While this function is async, it's not expected to be run as such.
     * @param {Object} tesseractData // contains .lines & .bbox of tesseract info
     * @param {sharp} sharpOCRImg  Sharp imagelike, Cropped Username image BUT scaled to OCR size
     * @param {import("./UtilModule.mjs").RectObj} orig_img_size Image_size of the original cropped image to bypass metadata issues
     * @returns {Array[String]} retList
     */
    addPage (tesseractData, sharpOCRImg, orig_img_size, capture_dt) {
        const retList = []  // List of names to return for state info
        
        const HEIGHT_PADDING = 13; // TODO: Turn into pct
        if (!tesseractData.lines) return retList
        
        const validLines = tesseractData.lines.filter( line => line.text.length > 2)
        if (validLines.length <= this.MIN_PAGE_CHECK) {
            console.warn(`Discard, not enough usernames found. ${validLines.length}`)
            return retList
        }

        const OCR_SCALE_RATIO = UserNameBinarization.OCR_WIDTH / UserNameBinarization.NAME_CROP_RECT.w;
        /** This will be the trueUsernameHeight thanks to res_basis */
        const OCR_RES_BASIS = new PixelMeasure(
            PixelMeasure.MEASURE_WIDTH * OCR_SCALE_RATIO, 
            PixelMeasure.MEASURE_HEIGHT * OCR_SCALE_RATIO
        );
        const USERNAME_OCR_BOX_HEIGHT = OCR_RES_BASIS.getVerticalUnits(
            UserNameBinarization.USERNAME_HEIGHT, {floor:true});
        const OCR_IMG_HEIGHT = OCR_RES_BASIS.getVerticalUnits(orig_img_size.h, {floor:true});
        const OCR_IMG_WIDTH = OCR_RES_BASIS.getHorizUnits(orig_img_size.w, {floor:true})

        /** height of the OCR binarized buffer */
        // const ocrImgHeight = Math.floor(OCR_SCALE_RATIO * orig_img_size.h); // sharp.scale is not reflected in this buffer.
        /** width of the OCR binarized buffer */
        // const ocrImgWidth = Math.floor(OCR_SCALE_RATIO * orig_img_size.w); // sharp.scale is not reflected in this buffer.
        /** @type {Object<string, int>} pageData #. {user:string, idx:int} */
        const pageData = []
        /** @type {Object[]} Current page username objects */
        const pageParsedInfo = []

        // 2X lines per image is expected - UI changed
        for (let line of tesseractData.lines) {
            const username = line.text.trim()
            if (username == '') continue    // Ignore empty lines

            // Determine pageData info: location where the username was read & save 
            /** Get vertical center of username box */
            const username_box_center = (line.bbox.y1 - line.bbox.y0)/2 + line.bbox.y0
            /** Division in OCR Image bounds that matches the user lines */
            const division = Math.floor(username_box_center / (USERNAME_OCR_BOX_HEIGHT))  
            pageData.push({"username":username, "division":division}) // set the current division

            const validUsername = username.length > 2;
            if (validUsername) { // Re-calc confidence then add to hash+list
                let conf = line.confidence
                if (line.confidence == 0) { // line -> word -> symbol to recalc confidence
                    const symbolSum = line.words[0].symbols.reduce( (acc,b) => acc+b.confidence, 0)
                    conf = symbolSum / (2 * line.words[0].symbols.length)
                }
                pageParsedInfo[division] = {'username':username, 'conf':conf, 
                    'division':division, 'capture_dt':capture_dt, 'bbox':line.bbox,
                    'line':line}
                
                retList.push(`[${division}]${username}, ${conf}`)
            
                // Extract the image
                // const bbox = line.bbox
                // pageParsedInfo[division]['imgPromise'] = // set image buffer promise to be made after
                //     sharpOCRImg.extract({  left: 0,
                //                         width: OCR_IMG_WIDTH,
                //                         top: Math.max(bbox.y0 - HEIGHT_PADDING, 0),
                //                         height: Math.min((bbox.y1+HEIGHT_PADDING) - bbox.y0, OCR_IMG_HEIGHT)
                //     })
                //     .jpeg().toBuffer()
                //     .catch( err => { console.warn(`Couldn't retrieve image buffer ${err}`)})
            }
            // NOTE: Ditch name if invalid? I assume that the incomplete text cant be matched to alias to help here
        }

        // take the first line, try to match to previous page
        /** best-match within leven distance of # */
        const MIN_MATCH = 4;
        /** number of links required before joining pages */
        const LINK_AMOUNT = 3
        /** where currPage points to prev page */
        const linkUp = {}
        /** Current line idx being checked */
        let pageDataLineIdx = 0
        /** final answer of link offset to previous page */
        let linkAnswer = null
        
        // NOTE: Push this to async maybe
        // Match at least LINK_AMOUNT until the pages line up
        while (this.lastPage.length > 0 && pageDataLineIdx < pageData.length) {
            let lowestMatch = {name: null, match: MIN_MATCH, division: null}    // lowest leven match
            const lineCheck = pageData.at(pageDataLineIdx++)    // line being checked
            const checkUsername = lineCheck['username']

            for (const lastUser of this.lastPage) {    // loop will not run if lastPage is empty
                const {username, division} = lastUser
                
                let dist = this.calcLevenDistance(checkUsername, username, lowestMatch.match, true)
                if (dist < lowestMatch.match)
                    lowestMatch = {name: username, match: dist, division: division}
            }

            if (lowestMatch.name) {
                const lineDivision = lineCheck['division']
                // console.warn(`Matched ${checkUsername}[${lineDivision}] to ${lowestMatch.name}[${lowestMatch.division}] prev`)

                const divisionOffset = lowestMatch.division - lineDivision
                linkUp[divisionOffset] = (linkUp[divisionOffset] ?? 0) + 1

                if (linkUp[divisionOffset] >= LINK_AMOUNT) {
                    linkAnswer = divisionOffset
                    break // break outer loop
                }
            }
        }

        let startIndex = this.usersInOrder.length   // Offset to full user list

        // Stitch pages together
        if (linkAnswer != null) { 
            console.warn(`Page Match lines by ${linkAnswer}. Joining pages.`)
            startIndex -= (this.lastPage.at(-1).division+1 - linkAnswer)
        } else { // Add pages together
            let result_text = (this.lastPage.length > 0) ? `${this.lastPage.map( line => line.username)}` : `{empty list}`
            console.error(`No page match for \nLAST:\t${result_text}\nCURR:\t${pageData.map( line => line.username)} `)
        }

        const currPageIdx = this.pageIdx+1;

        // Add users to list & Get image promises (including skipped divisions)
        for (let i=0; i<pageParsedInfo.length; i++) {
            const userInfo = pageParsedInfo.at(i)
            const nextImgIdx = this.fullImageList.push([]) - 1
            const division = i

            /** sharp extracted username image */
            let imgExtract = null;
            // add image (even if no text was found) from division based on height/width
            if (userInfo == undefined) {
                imgExtract = sharpOCRImg.extract({  left: 0,    width: OCR_IMG_WIDTH,
                    top: Math.floor(division * USERNAME_OCR_BOX_HEIGHT),
                    height: Math.floor(USERNAME_OCR_BOX_HEIGHT)
                })
            } else {
                // else grab image promise while adding user
                const userObj = this.add(userInfo.username, userInfo.conf, 
                    startIndex + userInfo.division, userInfo.capture_dt);
                if (userObj.fullImgIdxList.length < UsernameTracker.USER_IMG_LIMIT || userInfo.conf >= userObj.confidence) {
                    const bbox = userInfo.bbox
                    imgExtract = sharpOCRImg.extract({  left: 0,
                        width: OCR_IMG_WIDTH,
                        top: Math.max(bbox.y0 - HEIGHT_PADDING, 0),
                        height: Math.min((bbox.y1+HEIGHT_PADDING) - bbox.y0, OCR_IMG_HEIGHT)
                    })
                }
            }

            imgExtract
            ?.jpeg().toBuffer()
            .catch( err => { console.warn(`Couldn't retrieve image buffer ${err}`)})
            // add image to usernameTracker object
            .then( imgBuffer => {
                this.addImage(currPageIdx, division, imgBuffer, startIndex + division, nextImgIdx)
                if (userInfo) {
                    const userObj = this.usersInOrder[startIndex+division]
                    // swap if higher confidence
                    if (userObj && userObj.fullImgIdxList.length > 1 
                        && userInfo.conf >= userObj.confidence) {
                            const swap = userObj.fullImgIdxList.pop()
                            userObj.fullImgIdxList.shift(swap)
                    }
                    while (userObj && userObj.fullImgIdxList.length > UsernameTracker.USER_IMG_LIMIT) {
                        const delImgIdx = userObj.fullImgIdxList.pop();
                        this.removeImage(delImgIdx, userObj)
                    }
                }
              } // end of promise
            )
        }

        this.lastPage = pageData // set page
        this.pageIdx += 1   // Increment page
        
        return retList
    }

    /**
     * Add image to object, link to username object (if exists)
     * @param {number} pageIdx 
     * @param {number} division 
     * @param {import("tesseract.js").ImageLike} imgBuffer 
     * @param {number} userIdx 
     * @param {number} fullImgIdx 
     */
    addImage (pageIdx, division, imgBuffer, userIdx, fullImgIdx) {
        
        const userObj = this.usersInOrder.at(userIdx)
        const newImg = new UserImage(pageIdx, division, imgBuffer, userObj)
        
        this.fullImageList[fullImgIdx] = newImg

        if (userObj) 
            userObj.fullImgIdxList.push(fullImgIdx)
    }
    
    /** DEPRECATED 
     * @deprecated
    */
    addImageOld(username, imgBuffer, fullImgIdx) {
        const newImg = new UserImage(this.pageIdx, imgBuffer, null)
        this.fullImageList[fullImgIdx] = newImg

        const userObj = this.hash.get(username)
        if (!userObj) { // Add for user identification
            this.unverifiedImgs.push(imgBuffer)
        } else if (userObj.verifyAmount < 2) {
            // else add to imgHash & add to unverified user
            userObj.fullImgIdxList.push(fullImgIdx)
            this.unverifiedUsers.push(userObj)
        } else {
            userObj.fullImgIdxList.push(fullImgIdx)
        }
    }

    /** Remove image from fullImgList
     * Assumes image has been removed from userObj, this is simply for debug
     */
    removeImage(fullImgIdx, userObj) {

        const imgObj = this.fullImageList.at(fullImgIdx);
        this.fullImageList[fullImgIdx] = null;
    }

    clear () {
        this.pageIdx = 0
        this.hash.clear()

        this.usersInOrder = []

        this.unverifiedImgs = []
        this.unverifiedUsers.clear()
        
        this.fullImageList = []
        this.lastPage = []
    }

    getImage(username) {
        // Return this image associated with this user
        
        if (this.hash.has(username)) {
            const userObj = this.hash.get(username)
            const imgObj = this.fullImageList[userObj.fullImgIdxList[0]] // Return random?
            // console.warn(userObj.fullImgIdxList)
            // console.warn(userObj.fullImgIdxList.map(val => this.fullImageList[val]))
            // console.warn(`Got image from P:${imgObj.pageIdx} D:${imgObj.division}`)
            return imgObj.imgBuffer
        }
        return null
    }

    getFullImageLength () {
        // Return length of images
        return this.fullImageList.length
    }

    getImageFromFullList (idx) {
        if (idx < this.fullImageList.length)
            return this.fullImageList[idx].imgBuffer
        else
            return null
    }


    status () {
        // Return status for server debug
        return {
            'user_list': this.usersInOrder.length,
            'full_img_list': this.fullImageList.length,
            'read_pages': this.pageIdx,
            'unverifed': {
                'users': this.unverifiedUsers.size,
                'img': this.unverifiedImgs.length
            }
        }
    }

    PERFORMANCE_MARK_FIND = "find_username"
    USER_RANK_LIST = 10

    /**
     * 
     * @param {String} searchUsername 
     * @param {Number} lowestRank 
     * @returns {LimitedList} 
     */
    find (searchUsername, lowestRank=Infinity, lowerCasePenalty=true) {
        // Attempt to find the 5 closest usernames to this text
        const sort = (a,b) => a[0] < b[0]
        const usernameRanking = new LimitedList(this.USER_RANK_LIST, null, sort)
        let currentMax = lowestRank
        performance.mark(this.PERFORMANCE_MARK_FIND)

        for (const userObj of this.usersInOrder) {
            if (!userObj) continue
            for (const userAlias of userObj.aliases) {
                const testUsername = userAlias
                let dist = this.calcLevenDistance(searchUsername, testUsername, currentMax, lowerCasePenalty)
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
     * @param {string} newUsername 
     * @param {string} oldUsername 
     * @param {Number} earlyOut 
     * @returns {Number}
     */
    calcLevenDistance (newUsername, oldUsername, earlyOut=Infinity, lowerCasePenalty=true) {
        // Return the distance between the two usernames
        const flatArray = new Uint8Array((newUsername.length+1) * (oldUsername.length+1))
        let getOffset = (x,y) => y*(newUsername.length+1) + x

        const del_add_penalty = 2
        for (let x=0; x < newUsername.length+1; x++) {
            flatArray[getOffset(x,0)] = x * del_add_penalty
        }
        for (let y=1; y < oldUsername.length+1; y++) {
            flatArray[getOffset(0,y)] = y * del_add_penalty
        }

        // start DP iteration
        // NOTES: If I want to penalize insertion/deletion, increase cost for left/up movement
        for (let x=1; x<newUsername.length+1; x++) {
            for (let y=1; y<oldUsername.length+1; y++) {
                const penalty = this.compareLetters(newUsername[x-1], oldUsername[y-1], lowerCasePenalty)
                // const penalty = newUsername[x-1] == oldUsername[y-1] ? 0 : 1
                const trip = Math.min(
                                flatArray[getOffset(x-1, y)], 
                                flatArray[getOffset(x-1, y-1)], 
                                flatArray[getOffset(x,   y-1)])
                flatArray[getOffset(x,y)] = penalty + trip
                
                if (x == y && flatArray[getOffset(x,y)] > earlyOut) return Infinity // early out
            }
        }

        return flatArray[getOffset(newUsername.length, oldUsername.length)]

    }


    calcMatchDistance (matchUsername, checkUsername) {
        // fuzzy match
        let score = 0
        let lastMatchIdx = null
        // let matchBin = 0

        let ltMap = new Map()
        for (let lt_idx in checkUsername) {
            let lt = checkUsername[lt_idx]
            
            if (!ltMap.has(lt)) ltMap.set(lt, [])
            ltMap.get(lt).push(parseInt(lt_idx))
        }

        for (let lt of matchUsername) {
            if (ltMap.has(lt)) {
                score += -1
                let lt_pos = ltMap.get(lt).shift()
                if (lastMatchIdx) {
                    score += Math.abs(lastMatchIdx + 1 - lt_pos)
                }
                lastMatchIdx = lt_pos
                if (ltMap.length == 0) ltMap.delete(lt)
            } else {
                score += 2
            }
        }

        return score
    }

    compareLetters(ltA, ltB, lowerCasePenalty=true) {
        
        if (ltA == ltB) return 0
        if (ltA.toLowerCase() == ltB.toLowerCase()) return lowerCasePenalty ? 1 : 0
        
        if ( ADJC_LETTER_MAP.has(ltA) ) {
            const adjcSet = ADJC_LETTER_MAP.get(ltA)
            if (adjcSet.has(ltB)) return 1
        }
        return 2
    }
}

class TrackedUsername {
    /**
     * Store info about the Username and etc
     * @param {String} name Username string
     * @param {number} confidence Confidence in OCR
     * @param {number} index Index in the full 1000 list
     * @param {number} enterFrameTime Ingest date
     * * @param {Date} endTs Ingest date
     */
    constructor (enterFrameTime=null) {
        /** @type {string} most confident name */
        this.name = null                
        /** @type {number} approx length of the */
        this.length = null
        /** @type {number} confidence percentage */
        this.confidence = null
        /** @type {number} index in user list */
        this.index = null
        
        /** @type {number} ingest timestamp in ms */
        this.enterFrameTime = enterFrameTime
        this.exitFrameTime = null

        /** @type {UserImage<>} images of the user */
        this.partialImgList = []

        /** @type {UserImage} Image to display to user */
        this.bestImg = null

        /** @type {Set<string>} set of usernames that are at this index */
        this.aliases = new Set()
    }


    // TrackerUsername has 3 states
    /*
    1. Pre-screen                   - no appeartime
    2. On screen, unknown length    - appeartime
    3. On screen, length known      - apeparTime & length
    3.a (going off-screen), this might take some testing    - endTime*
    4. Off screen - endTime
    */

    /**
     * Return if userbox is expected to be on-screen.
     * This is true if endFrameTime is past currentTime
     * @param {number} currFrameTime 
     */
    onScreen (currFrameTime) {
        return (this.exitFrameTime && this.exitFrameTime > currFrameTime)
    }

}

/**
 * More intensive tracker, that links each username
 */
export class UsernameAllTracker {

    constructor () {
        /** @type {Map<string, Username>} hash of all names */
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

    /** Using internal frameTime, predict the shown userboxes based on 
     * input frameTime.
     * @param {*} frameTime current frame being sent
     * @param {number} [totalUsers=null] total users from the top-left corner
     * @param {boolean} [predictFullScreen=true] assume that all 24 slots are occupied. 
     * This overrides totalUsers and should only be used when totalUsers is obscured
     * @returns {Array<TrackedUsername>} list of tracked users, including new users that haven't been verified
    */
    predict (frameTime, totalUsers=null, predictFullScreen=true) {

        let startUserIndex = this.currentScreenFirstIndex;
        const screenUsers = []

        // Depending the totalUsers 
        let expectedUserAmt = UsernameAllTracker.SCREEN_MAX
        if (!predictFullScreen && totalUsers) {
            expectedUserAmt = Math.min(UsernameAllTracker.SCREEN_MAX, totalUsers - this.currentScreenFirstIndex)
        }

        let offsetFromCurrent = 0;

        // Iterate names, skipping names that have expired*
        while (screenUsers.length < UsernameAllTracker.SCREEN_MAX) {
            const userbox = this.usersInOrder.at(startUserIndex++)
            if (userbox.exitFrameTime >= frameTime) {
                offsetFromCurrent++
                continue
            }
            if (userbox == undefined) break // Early-out
            screenUsers.push(userbox)
        }

        // Now create new users to fill the remaining space
        while (screenUsers.length < expectedUserAmt) {
            // NOTE: does not add into list until verified
            screenUsers.push(new TrackedUsername(frameTime));
        }

        return {predictedUsers: screenUsers, offset: offsetFromCurrent}
    }

    recognizeUsers (imgBuffer) {

    }
}