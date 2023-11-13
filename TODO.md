# TODO.md

## todo today

Move lambda code into main repo folder
Update lambda deployment so I have something running today without worry
Start sampling & testing with new overlap code. 
Review colorCache code & formalize the check so I can switch things

---

## Goals

1. Get a narrow list of coordinates that corresponds to Waiting To Start
2. Feed that into the program to do the check
3. Move Lambda code into main repo now that I don't need a new repo build

Optional
5. Maybe consider writing a program for individual letter font recognition?
    That can be used for other programs / clout?

    - 2nd, the pixel sampling and range should be improved, as with the transparent background change, false flags are being made.
    Also these samples were made when the flood-fill was not made; flood-fill captures the text well, but its too broad.

## todo later
- Do the full page by image for the debug admin

Website
    Verify new_img logic
    Verify Logic
        Retrieve - Get request+id+name?
            New_img / old_img
            1. What is this username?
                Input + Button (you must type input from nothing to prevent dummies)
        Send back to server

Server
    Logging improvement for response times
    Reduce memory stuff (memory)
        Think about reducing the images used based on confidence 
        Or only save unique names to prevent pile-up of data

    START/STOP AUTH
    Verify image backend 
        request_id + info (in set)
        if 1, add to verified (only if username is not taken)
        once info has 2 similar results, add to verified

Server stability
    Caching levenDistance answers (for user queries)? 
    // Don't think this is necessary due to the lambda removing a lot of the processing from the server


## Bugs

## Thoughts
The list transition took significantly less time than expected. Writing some notes to talk about next steps.

# General Server Notes
Here I'm putting general improvements for the server & other notes.

- Show marbles ingest date? (terrible for testing, would need to be manually updated) 
- Manually updated status bar on marbles site? (Seems overkill, it's supposed to be a hands-off system)
- Stop status if connected during stop but no update? - (I can handle this traffic, just greatly reduce the update time?)

# Username reading notes

Ok lets talk about what prevents the list from being 100% accurate. 
1. Tesseract's inability to 100% determine the right characters, even when text is fairly* clear.
2. Inability to 100% accurately isolate & binarize usernames from the background.
3. Inability to recognize and remove the "Twitch chat box" that obscures some usernames & other obstacles
4. Determining the accurate length of the usernames to prevent the reading of usernames behind text

Now, I want to talk about each problem, theoritical solutions, current solutions and etc.

## Tesseract

Tesseract has a few options, but it's a little hard to test since there are many differences in usernames & screenshots that I need to use a programmatic test in order to determine how text accuracy. I have seen Tesseract reliably misjudge the letter r since the flick at the top is rarely kept.
So is that an isolate issue? Probably? But I've seen some accuracy issues running the same image with different modes.

Other than that Tesseract being a black box makes things a bit easier since I can't program a better solution. Well....
I could write my own AI for this particular Roboto text; but thats a really really truly dumb idea.
(It's probably an isolate issue.)

## Twitch chat box & other obstacles

So on Barb's stream, there is a high chance that the 1st 6-8 usernames are obscured by twitch chat. If I perfectly remove Twitch chat somehow, it would still be unreadable to Tesseract.

I considered overlaying multiple samples to account, but this doesn't account for big obstructions (SNAKEY, Barb, images, etc) and since there's a delay in populating due to the bot; I can no longer assume the 1st 6-7 usernames remain constant.
Especially with the new transparent chat window that won't even identify usernames behind it.
Therefore I'm shelving the issue until I have more information or a better solution.

## Accurate Username text
So a majority of the power goes into isolating usernames from background. Going through every single part logic that does this is time-consuming, so I'll talk about the improvements instead.

- Upgrade the username ingest by looking at the !play indicator at the end (but only when reaching the last 200)

### Username length
I not going to go over the heuristics for getting the username length. Lets summarise that the program tries to figure out the max letters from the left and tries to stop & remove obstacles.
Background doesn't work (I did the math*) cause of bitrate; but I did try; although I didnt do it programmatically. 
Also this is the ONLY solution possible; because of the 11 kerning; there's a lower limit on the kerning space, it doesn't work on very dark backgrounds; kerning is hard to do without my own software.

### Time scaling
As talked about before, overlaying each index capture "should" improve how accurate the capture is.
Also I will not do that; cause it's more pixel manip & I think the other options are better.

### Sampling improvements
I'm currently implementing my strat of painting the samples, automatically getting them via PixCompare then building an OBB using minBoundingBox.py

I think any other significant improvements would be to computationally intensive, so I'm not doing it

### Name verification
    I can verify names by looking at !PLAY icon to the right- but I dont think this is useful OUTSIDE the case at the end if a in-game username overlaps with the right position
    I'm leaving this as its an edge-case and it only pollutes the username length/memory; its not breaking.

---

## Server setup notes
// I installed a bunch of other things- but didn't save the other commands.
// I added PM2, nginx and a few other things. Should probably save the bash history
---
    sudo apt update
    sudo apt install streamlink
    sudo apt install ffmpeg (already installed)
    mkdir github
    git clone https://github.com/adrianAnyansi/MarblesNameGrabber.git
    cd MarblesNameGrabber/
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
    source ~/.bashrc
    nvm install v18.17.1

# MVP - Able to run on my local machine

## Text binarization 
0. Output each name boundary to an object; so another function can handle it
1. Flood-fill, mark valid px with a:254; on edges mark as a:253, other is a:0
2. create new buffer, copy px to gray scale while boosting values to black(max)
    debug: write buffer to text
    a. Add samples for mod, vip & streamer colors

## Buffer to OCR pipeline
3. Test tesseract with bin image
    tweak: for better output
4. Test tesseract with buffer
5. Link img process to tesseract path
6. Test run with vod output + timing

## Run as server
7. Build server components + memory database
8. Create child process for streamlink
9. Build routes
10. Test server to run independently

11. Start building webpage and UI
12. Attach server to 



# VOD  NOTES streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m35s" best

39:42 Game loads, names immediately start populating, half way down the page (chat covers ~10 names)
39:45 Name list is full [Quarktos] 
39:48 Name begins to scroll [peepoJuice] (Quarktos is 17th)
39:49 Stop
39:50 Stop2 [SimkinPhd] (peepoJuice 6th)
39:54 Stop [BigZacEnergy] (17th)
39:55 Stop [dwarvendynamite] (6th)
39:59 Stop [flex_mentalo] (17th)
40:01 [JamesFnX] (6th)
40:04 [deltahedget0] (17th)
40:06 [Simbossa] (6th)
40:09 [rumham11] (17th) (ok you get it)
40:11 [jotabyte]
40:15 [Piemanlowa]
40:16 [The_Wollyhops]
40:20 [osnap]
40:22 [lawaccount1337]
40:25 [Goontek]
40:27 [alyssasketches]
40:30 [zarahAP]
40:32 [bagamuffin]
40:35 [AtomicNumber79]
40:37 [sung251]
40:41 [lbs0219]
40:43 [VinceAyne]
40:46 [Alex_Made_An_Account]
40:49 [Mr_GoonAndWatch]
40:51 [syhren]
40:53 [LenninG]
40:55 [RonDongler]
40:58 [Zw1ggy]
(not continuing, this will take 2 more minutes)
42:34 The last name is on screen.
