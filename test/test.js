/* eslint-disable @typescript-eslint/no-var-requires */
(async function(){

    const path   = await import( "path" )
    const fs     = require( "fs-extra" ) //has to be a require statement, so that we can extend it
    const open   = (await import( "open" )).default
    const moment = (await import( "moment" )).default
    const globby = await import( "globby" )
    const chalk  = new (await import( "chalk" )).Chalk
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const Level  = (await import( "level" )).Level

    { // setup logging

        const log = {}
        const levels = {

            "help"  : "bgMagenta", //display help text

            "trace" : "bgCyan",   //report location
            "debug" : "bgBlue",   //report state of variables
            "info"  : "bgWhite",  //report info for the operator
            "warn"  : "bgYellow", //can the subprocess continue with the unwanted state?
            "error" : "bgRed",    //can the app continue with the unwanted state?
            "fatal" : "bgRed",    //crash the app
            
        }

        const timestamp = () => chalk.dim(`[${moment().format( "HH:mm:ss" )}]`) + " "

        log.g = ( level, label )=>{

            if( !label )
                label = level.toUpperCase()

            process.stdout.write( timestamp() )
            console.group( chalk[ levels[ level ] ].bold( label ) )

        }

        log.g.end = ()=>{
            console.groupEnd()
            console.log()
        }

        log.trace = ( message="Trace Called", label="TRACE" ) => {

            log.g( "trace", label )

            let stack = new Error()
                .split("\n").slice(1).join("\n") //remove the first line
                .trim()                          //trim off any leading or trailing whitespace
                .replaceAll(/^\s+/gm,'')         //trim off leading whitespace for everyline
            console.log( `${ message }\n\n${ stack }` )

            log.g.end()

        }

        log.debug = ( object, label="DEBUG" ) => {

            log.g( "debug", label )

            console.log( object )

            log.g.end()

        }

        log.info = ( message, label=" INFO" ) => {
            process.stdout.write( timestamp() )
            console.log( `${ chalk[ levels[ "info" ] ]( label ) }: ${ message }` )
        }
        
        log.warn = ( message, label=" WARN" ) => {
            process.stdout.write( timestamp() )
            console.log( `${ chalk[ levels[ "warn" ] ]( label ) }: ${ chalk.underline( message ) }` )
        }
        
        log.log = ( message ) => {
            process.stdout.write( timestamp() )
            console.log( `${ message }` )
        }

        log.error = ( message, label="ERROR" ) => {
            process.stdout.write( chalk.red(`[${moment().format( "HH:mm:ss" )}]`) )
            console.log( `${ chalk[ levels[ "error" ] ]( label ) }: ${ message }` )
            log.trace( "Error Occurred" )
        }

        log.fatal = ( message, label="FATAL" ) => {

            log.error( message, label )
            process.exit(1)

        }

        global.log = log

    } // finish setting up logging

    const log = global.log

    log.g( "info", "PERFORMING INITIALIZATION:" )

    { // globals factory

        log.g( "info", "LOGGING SETUP. SETTING UP GLOBALS" )

        log.log( "Adding .escape() method to RegExp..." )
        { // [[return:string] function] RegExp.escape(): escapes all special regex characters in an input string
    
            RegExp.escape = pattern => {
                return pattern.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
            }
    
        }

        log.log( "Parsing Node.js's argv to something that makes sense..." )
        { // [array] global.args: parsed arguments for script
    
            const args = process.argv.slice()
    
            if( args[0] == "node" )
                args.shift()
    
            while( -1 < args.findIndex( argument => {
    
                return RegExp( `${
                    RegExp.escape( path.basename(__filename) )
                }$`).test( argument )
    
            })){
                args.shift()
            }
    
            global.args = args
    
        }

        log.log( "Wrapping execSync() into global.shell()..." )
        { // [function] global.shell(): wrapper function for execSync
    
            const execSync = require( "child_process" ).execSync
        
            global.shell = command =>{
                return execSync( command, { "timeout" : 30000, "stdio" : 'pipe'} ).toString().trim()
            }
    
        }

        log.log( "Wrapping write/readFileSync() into global.save/loadfile() respectively..." )
        { // [function] global.savefile() and global.loadfile(): wrapper functions for writeFileSync and readFileSync
    
            global.loadfile = path => {
                return fs.readFileSync( path, { 'encoding' : 'utf8' }).toString().trim()
            }
    
            global.savefile = ( path, data, flag="w" ) =>{
                return fs.writeFileSync( path, data, { 'encoding' : 'utf8', 'flag' : flag })
            }
    
        }

        log.log( "Creating alias fs.cd() (fs-extra) for process.chdir()..." )
        { // [function] fs.cd(): wrapper function for process.chdir()
    
            fs.cd = process.chdir
    
        }

        log.g.end() // end of SETTING UP GLOBALS

    }

    log.g( "info", "SETTING UP ENVIRONMENT CONSTANTS:" )

    const ENV = {
        "BRANCH" : {
            "DEFAULT"  : "main",
            "DETECTED" : global.shell( "git rev-parse --abbrev-ref HEAD" ),
            "ARGUMENT" : global.args[1]
        },
        "TESTFILE" : {
            "DEFAULT"  : "README.md",
            "ARGUMENT" : global.args[0]
        },
        "APPDATA" : {
            "OBSIDIAN" : `${
                process.env.APPDATA || 
                    ( process.platform == 'darwin' ?
                        process.env.HOME + '/Library/Application Support' :
                        process.env.HOME + "/.config" )
            }/obsidian`
        },
        "GIT" : {
            "ROOT" : global.shell( "git rev-parse --show-toplevel" )
        },
        "TIMESTAMP" : moment()
    }

    ENV.BRANCH   .SELECTED = ENV.BRANCH   .ARGUMENT || ENV.BRANCH.DETECTED || ENV.BRANCH.DEFAULT
    ENV.TESTFILE .SELECTED = ENV.TESTFILE .ARGUMENT || ENV.TESTFILE.DEFAULT
    
    ENV.GIT.NAME = path.basename( ENV.GIT.ROOT ) // this is the plugin's name
    
    // identify test by branch name and timestamp
    // - this is also the name of the unit test folder
    
    ENV.ID = `${ ENV.BRANCH.SELECTED }-${ ENV.TIMESTAMP.format('MM.DD.YYYY-HH.mm.ss') }`

    log.warn( "loading Local/Session Storage leveldb's...", "LEVELDB:" )
    // load leveldbs for obsidian
    ENV.LEVELDB = {
        "LOCAL" : new Level( `${ ENV.APPDATA.OBSIDIAN }/Local Storage/leveldb` ),
        "SESSION" : new Level( `${ ENV.APPDATA.OBSIDIAN }/Session Storage/leveldb` ) //this is currently unused by Obsidian. It is empty.
    }
    await ENV.LEVELDB.LOCAL.close()
    await ENV.LEVELDB.SESSION.close()

    await ENV.LEVELDB.LOCAL.open()
    await ENV.LEVELDB.SESSION.open()

    log.log( "leveldbs loaded" )
    
    log.debug( ENV, "ENVIRONMENT CONSTANTS:" )

    log.g.end() // end of SETTING UP ENVIRONMENT CONSTANTS
    log.g.end() // end of PERFORMING INITIALIZATION

    log.g( "info", "BUILDING THE TEST:" )

    // ensure test directory and cd into it
    fs.ensureDirSync( `${ ENV.GIT.ROOT }/test/${ ENV.ID }` );
    fs.cd(            `${ ENV.GIT.ROOT }/test/${ ENV.ID }` );

    // the root of this repository is a vault
    // setup test using the above vault on the (argument-provided) branch
    // - remove the test directory (prevents circular testing)
    // - optionally remove the docs directory

    ENV.OUTPUT = process.cwd()

    log.warn( `cloning ${ ENV.GIT.ROOT } to...`, "GIT CLONE:")
    console.log( ENV.OUTPUT )

    global.shell( `git clone "${ ENV.GIT.ROOT }" .` )
    global.shell( `git switch "${ ENV.BRANCH.SELECTED }" 2>/dev/null || global switch -c "${ ENV.BRANCH.SELECTED }"` )

    ENV.MANIFEST = require( `${ ENV.OUTPUT }/manifest.json` )

    log.log( "cleaning up clone..." )

    fs.removeSync( 'test' )
    // fs.removeSync( 'docs' )

    // setup the plugin via copy (copy the modified root directory to the core of the plugin)
    log.g( "warn", "PREPARING PLUGIN:" )

    log.log( "copying files..." )
    fs.ensureDirSync( `.obsidian/plugins/${ ENV.GIT.NAME }` )

    // copy the entire root directory except the test, docs (optional - see above), and .obsidian folders to the plugins directory

    globby.sync( "./!(.obsidian)" ).forEach( file => {

        fs.copySync( file, `.obsidian/plugins/${ ENV.GIT.NAME }/${ file }` )

    })

    log.g.end() // end of PREPARING PLUGIN
    log.g( "warn", "BUILDING PLUGIN:" )

    // build the plugin

    fs.cd( `.obsidian/plugins/${ ENV.GIT.NAME }` )
    log.log( "installing dependencies..." )
    global.shell( 'npm install --no-bin-links' )
    log.log( "building..." )
    global.shell( 'node esbuild.config.mjs test' )
    fs.cd( '../../..' )    

    log.g.end() // end of BUILDING PLUGIN
    log.g.end() // end of BUILDING THE TEST

    log.g( "info", "SETTING UP VAULT:" )

    log.log( "preparing vault tracker..." )
    
    // write '{}' to obsidian's vault tracker if it doesn't exist or if it is empty (== '')
    try{ global.savefile( `${ ENV.APPDATA.OBSIDIAN }/obsidian.json`, '{}', 'wx' ) } catch { /* Errors are expected */ }
    if( global.loadfile(  `${ ENV.APPDATA.OBSIDIAN }/obsidian.json` ) == '' )
        global.savefile(  `${ ENV.APPDATA.OBSIDIAN }/obsidian.json`, '{}' )

    log.log( "updating vault tracker..." )
    // get vaults list (hash table) from obsidian's vault tracker
    
    let { vaults } = require( `${ ENV.APPDATA.OBSIDIAN }/obsidian.json` )
    
    // if the vaults list is empty/null, create it
    
    if( !vaults )
        vaults = {}
    
    // add the vault entry
    // - obsidian URI starts by checking the vault tracker for this:
    
    vaults[ ENV.ID ] = {
        "path" : process.cwd(),
        "ts" : ENV.TIMESTAMP.toDate().getTime()
    }
    
    global.savefile(
        `${ ENV.APPDATA.OBSIDIAN }/obsidian.json`,
        JSON.stringify({ "vaults": vaults }))

    log.log( "adding vault cache..." )
    // create a vault cache
    // - this is the second thing that the obsidian URI looks for:
    
    global.savefile(
        `${ ENV.APPDATA.OBSIDIAN }/${ ENV.ID }.json`,
        JSON.stringify({
            "x": 0,
            "y": 0,
            "width" : 600,
            "height" : 800,
            "isMaximized" : true,
            "devTools" : true,
            "zoom" : 0
        }))
    
    log.g.end() // end of SETTING UP VAULT

    log.g( "info", "AUTO-ENABLING PLUGIN:" )
    log.g( "info", "ENABLING TRUST AUTHOR FLAG:" )

    let keyprefix = "_app://obsidian.md\x00\x01"
    let keys = {
        "enable-plugin" : `enable-plugin-${ ENV.ID }`,
        "file-explorer-unfold" : `${ ENV.ID }-file-explorer-unfold`
    }
    let valueprefix = "\x01"
    let values = {
        "enable-plugin" : "true",
        "file-explorer-unfold" : '["/"]'
    }

    log.log( "pushing keys to Local Storage..." )
    Object.keys( keys ).forEach( key => {

        let value = `${ valueprefix }${ values[ key ] }`
        key = `${ keyprefix }${ keys[ key ] }`

        ENV.LEVELDB.LOCAL.put( key, value )

    })

    log.warn( "closing leveldbs...", "CLOSING MUST BE DONE OR YOU'LL REGRET IT" )
    // leveldbs must be closed, because only 1 process can control a leveldb at a time
    // - if the leveldb gets locked, run the following (this assumes you get the "Resource Unavailable" Lock error)
    // ```
    // cd "path/to/appdata/obsidian/Local Storage/leveldb"
    // lsof LOCK
    // kill -9 [PID from "lsof"]
    // ```
    await ENV.LEVELDB.LOCAL.close()
    await ENV.LEVELDB.SESSION.close()

    log.g.end() // end of ENABLING TRUST AUTHOR FLAG
    log.g( "info", "ENABLING PLUGIN:" )

    log.log( "preparing community plugins tracker..." )
    
    // write '[]' to obsidian's community plugins tracker if it doesn't exist or if it is empty (== '')
    try{ global.savefile( ".obsidian/community-plugins.json", '[]', 'wx' ) } catch { /* Errors are expected */ }
    if( global.loadfile(  ".obsidian/community-plugins.json" ) == '' )
        global.savefile(  ".obsidian/community-plugins.json", '[]' )

    log.log( "updating community plugins tracker..." )
    // get plugins list (array) from obsidian's community plugins tracker
    
    let { plugins } = require( `${ ENV.OUTPUT }/.obsidian/community-plugins.json` )

    // if the plugins list is empty/null, create it
    
    if( !plugins )
        plugins = []

    plugins.push( `${ ENV.MANIFEST.id }` )
    
    global.savefile(
        ".obsidian/community-plugins.json",
        JSON.stringify( plugins ))

    log.g.end() // end of ENABLING PLUGIN
    log.g.end() // end of AUTO-ENABLING PLUGIN

    log.warn( "launching...", "GETTING READY!" )
    open( `obsidian://open?path=${ process.cwd() }/${ ENV.TESTFILE.SELECTED }` )
    log.log( "test launched!" )
    console.log()
    log.g( "help", "POSTINSTALL GUIDE:" )
    console.log()
    console.group( "run this to cd into the test repository:" )
    console.log( `cd "${ENV.OUTPUT}"`)
    console.groupEnd()
    console.group( "run this to cd into the test plugin folder" )
    console.log( `cd "${ENV.OUTPUT}/.obsidian/plugins/${ ENV.GIT.NAME }`)
    log.g.end() // end of POSTINSTALL GUIDE

})()