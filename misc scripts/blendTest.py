
filename = "Overlayvalues.txt"

# file = open(filename)
compTable = []

with open(filename) as file:

    fstRGB = []
    sndRGB = []
    
    for line in file:
        if (line == "" or line == "\n"): continue

        if (fstRGB and sndRGB):
            # Do comparison
            print("comparing")
            res = []
            res.append(fstRGB)
            res.append(sndRGB)
            res.append([fstRGB[i] - sndRGB[i] for i in range(len(fstRGB))])
            res.append([sndRGB[i]/fstRGB[i] for i in range(len(fstRGB))])
            fstRGB = []
            sndRGB = []
            compTable.append(res)
        
        emptyArr = fstRGB if not fstRGB else sndRGB
        # print(f"{'1st' if not fstRGB else '2nd'}")
        [emptyArr.append(int(val)) for val in line.split(',')] # Oh Im dumb
        if len(emptyArr) < 3:
            print(f"Error {line}")
            break
        
        print(emptyArr)


print("Results!!!")
print("-----")
comboArr = [0,0,0]
allRGB = 0
for res in compTable:
    print(f"{str(res[0]):15} | {str(res[1]):15} | {str(res[2]):15} | {str(res[3]):15}")
    comboArr[0] += res[3][0]
    comboArr[1] += res[3][1]
    comboArr[2] += res[3][2]
    allRGB += res[3][0] + res[3][1] + res[3][2]

print("Comb")
print(f"{[comboPart/len(compTable) for comboPart in comboArr]}")
print(f"{allRGB/(len(compTable) * 3)}")

