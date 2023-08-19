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

export class Heap {
    // Thanks to https://stackfull.dev/heaps-in-javascript
    // Anish Kumar for this tutorial
    constructor (values, IsMinHeap=true) {
        this.heap = [] // Any type
        this._isMinHeap = IsMinHeap

        for (let value of values) {
            this.push(value)
        }
    }

    push (value) {
        // Adds value to heap
        let currIdx = this.heap.push(value) - 1  // push key
        
        while (currIdx > 0) {
            let parentIdx = Math.floor((currIdx-1)/2)
            if ( this.valCompare(heap[currIdx], heap[parentIdx]) ) {
                this._swapIndex(currIdx, parentIdx)
                currIdx = parentIdx
            } else {
                break // dont swap, heap balanced
            }
        }
    }

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

    pop () {
        // Removes top-most value from heap
        this._swapIndex(0, this.heap.length-1) // swap to end
        let retVal = this.heap.pop() // get top of heap

        let checkIdx = 0
        const checkVal = this.heap[checkIdx]

        while (this._getLeftIdx(cmpIdx) < this.heap.length) {
            const swapIdx = this._getLeftIdx(cmpIdx) // left always exist
            const swapVal = this.heap[swapIdx]

            const rIdx = this._getRightIdx(cmpIdx)
            if (rIdx < this.heap.length && this.valCompare(this.heap[rIdx], swapVal)) {
                swapIdx = rIdx
                swapVal = this.heap[rIdx]
            }

            if (!this.valCompare(this.heap[checkIdx], swapVal)) break

            // swap lower value
            this._swapIndex(checkIdx, swapIdx)
            checkIdx = swapIdx
        }

        return retVal
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
            currLen >>= 1
            highestBit++
        }

        // Get all values greater than the bit
        let currMax = -1
        for (let b=2 ** (highestBit-1); b<this.heap.length; b++) {
            currMax = Math.max(currMax, this.heap[b])
        }
            
        return currMax
    }
}


const DEFINED_ADJC_SETS = [
    ['o', 'O', '0', 'n'],               // o & rounded set
    ['i', 't', 'r', 'n'],               // r set (flick on r is hard to capture)
    ['i', 'l', '|', 'f', 'L', '1'],     // long char set
    ['a', 'e', 's', 'o', 'g'],          // a set
    ['e', 'c', 'u', 'w'],            // e & curved lt set
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

    add (username, confidence) {
        let user = this.hash.get(username)
        if (user != undefined) {
            user = new Username(username, 0)
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

    find (username) {
        // Attempt to find the 5 closest usernames to this text
        
    }

    calcLevenDistance (newUser, oldUser) {
        // Return the distance between the two usernames
        const flatArray = new Uint8Array((newUser.length+1) * (oldUser.length+1))
        let getOffset = (x,y) => y*(newUser.length+1) + x

        for (let x=0; x < newUser.length+1; x++) {
            flatArray[getOffset(x,0)] = x
        }
        for (let y=1; y < oldUser.length+1; y++) {
            flatArray[getOffset(0,y)] = y
        }

        // start DP iteration
        // NOTES: If I want to penalize insertion/deletion, increase cost for left/up movement
        for (let x=1; x<newUser.length+1; x++) {
            for (let y=1; y<oldUser.length+1; y++) {
                const penalty = this.compareLetters(newUser[x], oldUser[y])
                const trip = Math.min(
                                flatArray[getOffset(x-1, y)], 
                                flatArray[getOffset(x-1, y-1)], 
                                flatArray[getOffset(x,   y-1)])
                flatArray[getOffset(x,y)] = penalty + trip

            }
        }

    }

    compareLetters(ltA, ltB) {
        
        if (ltA == ltB) return 0
        if (ltA.toLowerCase() == ltB.toLowerCase()) return 1
        
        if ( adjcLetterMap.has(ltA) ) {
            const adjcSet = adjcLetterMap.get(ltA)
            if (adjcSet.has(ltB)) return 1
        }
        return 2
    }
}
