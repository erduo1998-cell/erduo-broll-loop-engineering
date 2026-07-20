# Talking-head master contract

The visual candidate master must be silent and have exactly the SRT/master duration. The supplied edited source must have one readable audio stream at that same duration. The muxer maps only visual video plus the source's first audio stream, copies both codecs, and verifies the result has exactly one video and one audio stream. It never burns subtitles or inserts BGM.
