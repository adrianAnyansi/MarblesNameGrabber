# TODO.md

So things work, however text recogn is still slightly inaccurate.
I have some ideas to improve it

1. Manually paint sampling points to improve recogn
2. Put anti-sampling points to remove false positives
3. Scale non-matching colours by proximity to the base color
4. Do anti-flood fill if a flood fill goes above the vertical boundaries, and increase the left padding (cause of numbers)
5. Mess with scaling and blurring while running automated tests

I always forget to do this and then I figure out how much easier life is
when you have a plan that you don't have to rewrite every 2 minutess

Here's the plan for MVP.

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
