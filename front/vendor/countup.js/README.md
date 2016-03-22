# countup.js
Count number with transition

Originally created by @inorganik
Modified by Ivan Vesely(ivan.jan.vesely@gmail.com)
Add some brighterlink specific compressMode;
``` 
 32342 -> 32.3k
 531321 -> 531k
 1645244 -> 1.6m 
```

Example:
``` 
var numAnim = new countUp("SomeElementYouWantToAnimate", 0, 99.99, 2, 2.5); 
numAnim.start();
numAnim.update(135);
with optional callback:
numAnim.start(someMethodToCallOnComplete);
```
