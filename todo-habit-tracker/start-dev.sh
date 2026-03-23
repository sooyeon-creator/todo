#!/bin/bash
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd /Users/sooyeon.jun/plugin/todo-habit-tracker
exec /usr/local/bin/node ./node_modules/.bin/next dev --webpack --port 3000
