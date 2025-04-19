// Class to track and retrieve usernames
// And cause the "server" code is getting too cluttered

// export default {UsernameTracker, Heap}
// export {UsernameTracker, Heap}

import sharp from "sharp"
import { LimitedList } from "./DataStructureModule.mjs"
import { ImageBuffer, Mathy, PixelMeasure } from "./UtilModule.mjs"
import { UserNameBinarization } from "./UsernameBinarization.mjs"

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

/**
 * Moving username searcher to separate class
 * Not rewriting the old code as I'm lazy
 */
export class UsernameSearcher {

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
     * @returns {LimitedList} 
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
                // const testUsername = userAlias
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


export class TrackedUsername {
    /**
     * Store info about the Username and etc
     * @param {String} name Username string
     * @param {number} confidence Confidence in OCR
     * @param {number} index Index in the full 1000 list
     * @param {number} enterFrameTime Ingest date
     * @param {Date} endTs Ingest date
     */
    constructor (enterFrameTime=undefined) {
        /** @type {string} most confident name */
        this.name = null                
        /** @type {number} approx length of the username, negative */
        this.length = null
        /** @type {number} confidence percentage */
        this.confidence = 0
        /** @type {number} index in user list */
        this.index = null

        /** @type {boolean} has the username been seen */
        this.seen = false;

        /** @type {boolean} OCR in progress */
        this.ocr_processing = false;

        /** @type {number} ingest timestamp in ms */
        this.enterFrameTime = enterFrameTime
        // this.exitFrameTime = undefined
        this.debugexitFrame = null

        /** @type {UserImage<>} images of the user */
        this.partialImgList = []

        /** @type {ArrayBuffer} Image to display to user */
        this.bestImg = null

        /** @type {Set<string>} set of usernames that are at this index */
        this.aliases = new Set()
    }

    /** 
     * @returns {number} Time that username should be offscreen
     */
    get exitFrameTime () {
        if (!this.enterFrameTime) return undefined
        return this.enterFrameTime + UsernameAllTracker.FinishExitTime
    }

    /*
    TrackerUsername has 3 states
    1. Pre-screen                   - no appeartime
    2. On screen, unknown length    - appeartime
    3. On screen, length known      - appearTime & seen
    3.a (going off-screen), this might take some testing    - exitingTime*
    4. Off screen - endTime
    */

    /** 
     * @returns {number} Time that username right-line stops being visible
     */
    get exitingFrameTime () {
        if (!this.enterFrameTime) return undefined
        return this.enterFrameTime + UsernameAllTracker.BeginExitTime
    }

    set exitingFrameTime (time) {
        // TODO: Set the enteringFrameTime
        // also should have some flag to confirm if this is top of frame disappear or overlay disappear
        this.debugexitFrame = time
    }


    /**
     * Return if userbox is expected to be on-screen.
     * This is true if endFrameTime is past currentTime
     * @param {number} currFrameTime 
     */
    onScreen (currFrameTime) {
        return (this.exitFrameTime && this.exitFrameTime > currFrameTime)
    }


    static LENGTH_MIN = 3;
    /**
     * Helper function to match length within a range
     */
    matchLen (inputLen) {
        if (this.length == null) return false;
        
        return Mathy.inRange(inputLen, this.length, 
            [-TrackedUsername.LENGTH_MIN, TrackedUsername.LENGTH_MIN])
    }

    setLen(inputLen) {
        if (inputLen == null || inputLen == undefined) 
            return // I know JS considers this the same, but I don't so
        
        if (inputLen >= 0) {
            throw Error(`Given a negative length ${inputLen}`)
        }

        this.length = inputLen
    }

    /**
     * Add new image to the user
     * @param {Buffer} jpgBuffer 
     * @param {string} name 
     * @param {number} confidence 
     */
    addImage (jpgBuffer, name, confidence) {
        this.partialImgList.push(jpgBuffer)

        if (confidence > this.confidence) {
            // Update name and best Img
            this.name = name
            this.confidence = confidence
            this.bestImg = jpgBuffer
        }
        this.aliases.add(name)
    } 

    /**
     * Checks if user is available for OCR processing
     * User must 
     *      have length
     *      not already have OCR ongoing
     *      low confidence
     */
    readyForOCR () {
        return (
            this.length != null &&
            this.ocr_processing == false &&
            this.confidence < 85
        )
    }

    toJSON () {
        return {
            name: this.name,
            len: this.length,
            index: this.index,
            conf: this.confidence,
            aliases: Array.from(this.aliases.keys()),
            enterTime: this.enterFrameTime,
            exitingTime: this?.debugexitFrame
        }
    }
}

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
     * @param {import('./UsernameBinarization.mjs').TrackedUsernameDetection[]} testLenList 
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
     */
    shiftOffset (positiveShift) {
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