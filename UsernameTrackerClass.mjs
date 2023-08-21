// Class to track and retrieve usernames
// And cause the "server" code is getting too cluttered

// export default {UsernameTracker, Heap}
// export {UsernameTracker, Heap}

class Username {
    constructor (name, confidence, index=null) {
        this.name = name
        this.confidence = confidence
        this.index = index
    }
}

export class LimitedList {
    constructor (limit=Infinity, values=null, sortMethod=this.defaultASCSort) {
        this.list = []
        this.maxLength = limit
        this.sortMethod = sortMethod ?? this.defaultASCSort

        if (values) {
            for (let value in values)
                this.push(value)
        }
    }

    push(value) {
        this.list.push(value)
        this.sort()
        while (this.list.length > this.maxLength) 
            this.list.pop()
    }

    defaultASCSort (val1, val2) {
        return val1 < val2
    }

    sort() {
        // insertion sort which should work well for small-sorted arrays
        for (let i=1; i<this.list.length; i++) {
            const swapVal = this.list[i]
            let j=i;
            for (; j>0 && this.sortMethod(swapVal, this.list[j-1]); j--) {
                this.list[j] = this.list[j-1]
            }
            this.list[j] = swapVal
        }
    }

    peek() {
        return this.list[0]
    }

    sneak() {
        return this.list.at(-1)
    }

    isFull() {
        return this.list.length == this.maxLength
    }
}

export class LinkedListNode {
    constructor(value, prev) {
        this.value = value
        this.next = null
        if (prev)   prev.next = this
        // prev?.next = this
    }

    static Create(value) {
        return new LinkedListNode(value)
    }
}

export class LinkedList {

    DSC = 'LinkedList_Descending'
    ASC = 'LinkedList_Ascending'

    constructor(values, sortMethod, maxLen=Infinity) {
        this.root = null
        this.sortMethod = sortMethod
        this.maxLength = maxLen
        this.length = 0

        for (let val in values) {
            this.push(val)
        }
    }

    valCompare (val1, val2) {
        // For ASC, return True if val1 < val2
        // For DSC, return True if val2 < val1

        if (val1 == undefined) return false
        if (val2 == undefined) return true

        if (this.sortMethod == LinkedList.ASC) {
            return val1 < val2
        } else {
            return val1 > val2
        }
    }

    push(newVal) {
        // Add node to sorted LList
        let currLen = 0
        
        if (this.root == null) {
            this.root = new LinkedListNode(newVal)
            this.length = 1
            return this.root
        } else {
            let currNode = this.root
            while (this.valCompare(currNode.next?.value, newVal)) {
                currNode = currNode.next
                currLen += 1
            }

            if (currLen >= this.maxLength-1) return null // don't add
            // insert between nodes
            LinkedList.insertAfter(new LinkedListNode(newVal), currNode)
            this.length += 1

            // if overMaxLen, go to the end and pop last node
        }
    }

    pop() {
        // Return first node value
        let retVal = null
        if (this.root) {
            retVal = this.root.value
            this.root = this.root.next
        }
        return retVal
    }

    static insertAfter(insertNode, parentNode) {
        const tmp = parentNode.next
        parentNode.next = insertNode
        insertNode.next = tmp
    }
}

export class Heap {
    // Thanks to https://stackfull.dev/heaps-in-javascript
    // Anish Kumar for this tutorial

    MIN_HEAP = 'MIN_HEAP'
    MAX_HEAP = 'MAX_HEAP'

    constructor (values=null, maxLength=Infinity, IsMinHeap=true) {
        this.heap = [] // Any type
        this._isMinHeap = IsMinHeap
        this.maxLength = maxLength

        if (values == null) return
        for (let value of values) {
            this.push(value)
        }
    }

    // helper functions
    _swapIndex(idxA, idxB) {
        const temp = this.heap[idxA]
        this.heap[idxA] = this.heap[idxB]
        this.heap[idxB] = temp
    }
    _getLeftIdx(idx) {
        return (2*idx+1)
    }
    _getRightIdx(idx) {
        return (2*idx+2)
    }

    valCompare(val, val2) {
        if (this._isMinHeap) {
            return val < val2
        } else {
            return val > val2
        }
    }

    // heap functions
    push (value) {
        // Adds value to heap
        let currIdx = this.heap.push(value) - 1  // push key
        
        while (currIdx > 0) {
            let parentIdx = Math.floor((currIdx-1)/2)
            if ( this.valCompare(this.heap[currIdx], this.heap[parentIdx]) ) {
                this._swapIndex(currIdx, parentIdx)
                currIdx = parentIdx
            } else {
                break // dont swap, heap balanced
            }
        }

        if (this.length > this.maxLength)
            this.truncateLength(this.maxLength)
    }

    pop () {
        // Removes top-most value from heap
        this._swapIndex(0, this.heap.length-1) // swap to end
        let retVal = this.heap.pop() // get top of heap

        let checkIdx = 0
        // const checkVal = this.heap[checkIdx]

        while (this._getLeftIdx(checkIdx) < this.heap.length) {
            let swapIdx = this._getLeftIdx(checkIdx) // left always exist
            let swapVal = this.heap[swapIdx]

            const rIdx = this._getRightIdx(checkIdx)
            if (rIdx < this.heap.length && this.valCompare(this.heap[rIdx], swapVal)) {
                swapIdx = rIdx
                swapVal = this.heap[rIdx]
            }

            if (this.valCompare(this.heap[checkIdx], swapVal)) break

            // swap lower value
            this._swapIndex(checkIdx, swapIdx)
            checkIdx = swapIdx
        }

        return retVal
    }

    extend(...values) {
        // TODO: Implement and do length checks after   
    }

    peek () {
        // Return top value without popping
        return (this.heap.length > 0) ? this.heap[0] : null
    }

    sneak () {
        // Return bot value without popping
        // Based on length, we want max(values) > idx 2**(n-1)
        let currLen = this.heap.length;

        if (currLen == 0) return null
        if (currLen <= 1) return this.heap[0]

        let highestBit = -1
        while (currLen > 0) {
            currLen >>>= 1
            highestBit++
        }

        // Get all values greater than the bit
        let currMax = -1
        for (let b=2 ** (highestBit-1); b<this.heap.length; b++) {
            currMax = Math.max(currMax, this.heap[b])
        }
            
        return currMax
    }

    truncateLength (maxLen) {

        return; // Algorithm is invalid
        
        
        // Remove values until heap is N length
        if (this.heap.length <= maxLen) return
        
        // first iterate til we're larger than length
        let iterTo = 0;
        let depth = 1;

        while (iterTo + depth <= maxLen) {
            iterTo += depth;
            depth <<= 1;
        }
        if (iterTo < maxLen) { // we need to squeeze lowest variables into here
            // sort k elements, gonna throw it into a heap
            const internalHeap = new Heap(null, Infinity)
            for (let i=iterTo; i<this.heap.length; i++)
                internalHeap.push(this.heap[i])
            
            for (let j=iterTo; j<maxLen; j++)
                this.heap[j] = internalHeap.pop()
        }
        
        this.heap.length = iterTo; // this is valid for Javascript
        
    }

    get length () {
        return this.heap.length
    }

    // set _isMinHeap (bool) {
    //     // NOTE: do nothing
    //     console.log("[heap] do nothin")
    // }

    changeHeapType() {
        // changes heap type
        throw EvalError('Method not yet implemented')
    }
}


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
    ['4', 'd', 'A'],
    ['d', '9'],
    ['7', 'T'],
    ['g', 'y']
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
        this.hash = new Map()
        this.list = [] // ordered list
    }

    *[Symbol.iterator] () {
        yield this.list
    }

    get length () {
        return this.list.length
    }

    add (username, confidence) {
        let user = this.hash.get(username)
        if (user == undefined) {
            user = new Username(username, confidence)
            user.index = this.list.push(user)
            this.hash.set(username, user)
        } 
        else // update confidence
            user.confidence = Math.max(confidence, user.confidence)

    }

    remove(username) {
        if (!this.hash.has(username)) return False
        
        const user = this.hash.get(username)
        this.hash.delete(username)
        this.list.pop(user.index)
    }

    clear () {
        this.hash.clear()
        this.list.length = 0
    }

    PERFORMANCE_MARK_FIND = "find_username"
    USER_RANK_LIST = 10
    find (searchUsername) {
        // Attempt to find the 5 closest usernames to this text
        const sort = (a,b) => a[0] < b[0]
        const usernameRanking = new LimitedList(this.USER_RANK_LIST, null, sort)
        let currentMax = null
        performance.mark(this.PERFORMANCE_MARK_FIND)

        for (const userObj of this.list) {
            const testUsername = userObj.name
            let dist = this.calcMatchDistance(searchUsername, testUsername)
            const userRankObj = [dist, userObj]

            if (usernameRanking.isFull()) currentMax = usernameRanking.sneak()[0]
            if (currentMax == null || dist < currentMax) usernameRanking.push(userRankObj)
        }

        console.debug(`Find username ranking took ${performance.measure('username_mark', this.PERFORMANCE_MARK_FIND).duration.toFixed(2)}ms`)
        return usernameRanking.list
    }

    calcLevenDistance (newUsername, oldUsername) {
        // Return the distance between the two usernames
        const flatArray = new Uint8Array((newUsername.length+1) * (oldUsername.length+1))
        let getOffset = (x,y) => y*(newUsername.length+1) + x

        for (let x=0; x < newUsername.length+1; x++) {
            flatArray[getOffset(x,0)] = x
        }
        for (let y=1; y < oldUsername.length+1; y++) {
            flatArray[getOffset(0,y)] = y
        }

        // start DP iteration
        // NOTES: If I want to penalize insertion/deletion, increase cost for left/up movement
        for (let x=1; x<newUsername.length+1; x++) {
            for (let y=1; y<oldUsername.length+1; y++) {
                const penalty = this.compareLetters(newUsername[x-1], oldUsername[y-1])
                // const penalty = newUsername[x-1] == oldUsername[y-1] ? 0 : 1
                const trip = Math.min(
                                flatArray[getOffset(x-1, y)], 
                                flatArray[getOffset(x-1, y-1)], 
                                flatArray[getOffset(x,   y-1)])
                flatArray[getOffset(x,y)] = penalty + trip

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

    compareLetters(ltA, ltB) {
        
        if (ltA == ltB) return 0
        if (ltA.toLowerCase() == ltB.toLowerCase()) return 1
        
        if ( ADJC_LETTER_MAP.has(ltA) ) {
            const adjcSet = ADJC_LETTER_MAP.get(ltA)
            if (adjcSet.has(ltB)) return 1
        }
        return 2
    }
}
