#!/usr/bin/env node
const fs = require('fs');


const child_process = require('child_process');
const main_file_path = `${__dirname}/src/app.js`;

let error_string = "Please input correct form: \ndaemonize.js [start | stop]";
if (process.argv.length > 3 || process.argv.length < 3 )
{
    console.log(error_string);
    process.exit(0);
}

let pid_file_path = '/tmp/daemon_swap_manager.pid';

let command = process.argv[2];
if (command === 'start')
{
    fs.readFile(pid_file_path, function (err, data) {
        if (err) {
            if (err.code === 'ENOENT') {
                console.log(`Sudo execute ${main_file_path}`);
                let p = child_process.spawn('node', [main_file_path], {
                    cwd: `${__dirname}/src`,
                    detached: true,
                });
                fs.writeFile(pid_file_path, p.pid, function (err) {
                    if (err)
                        throw err;
                    process.exit(0);
                    })
            }
            else
                throw err;
        }
        else {
            console.log(`Already running! pid = ${data}`);
        }
    });
}
else if (command === 'stop')
{
    fs.readFile(pid_file_path, function (err, data) {
        if (err) {
            if (err.code === 'ENOENT') {
                console.log('Not running!');
            }
            else
                throw err;
        }
        else {
            let pid = parseInt(data);
            process.kill(pid);
            fs.unlink(pid_file_path, function (err) {
                if (err)
                    throw err;
                console.log("Stop running.");
            })
        }
    });
}
else {
    console.log(error_string);
}
