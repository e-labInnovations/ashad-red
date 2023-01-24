ashad-red
================

A wrapper for deploying [Node-RED](http://nodered.org) into the [Render](https://render.com/).

### Deploying Node-RED into Render

<!-- [![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/e-labInnovations/ashad) -->

### Password protect the flow editor

By default, the editor is open for anyone to access and modify flows. To password-protect the editor:

Add the following user-defined variables.

* NODE_RED_USERNAME - the username to secure the editor with
* NODE_RED_PASSWORD - the password to secure the editor with
* DATABASE_URL      - the prostgresql database url


run command: `node --max-old-space-size=384 node_modules/node-red/red.js --settings ./settings.js`
