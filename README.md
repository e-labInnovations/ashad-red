ashad-red
================

A wrapper for deploying [Node-RED](http://nodered.org) into the [Render](https://render.com/).

### Deploying Node-RED into Render

Requires Node.js 22.9 or later (Node-RED 5). Node 24 recommended.

<!-- [![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy?template=https://github.com/e-labInnovations/ashad) -->

### Password protect the flow editor

By default, the editor is open for anyone to access and modify flows. To password-protect the editor:

Add the following user-defined variables.

* NODE_RED_USERNAME - the username to secure the editor with
* NODE_RED_PASSWORD - the password to secure the editor with
* DATABASE_URL      - the prostgresql database url

For local runs, copy `.env.example` to `.env` and fill in values.


run command: `node --max-old-space-size=384 node_modules/node-red/red.js --settings ./settings.js`
