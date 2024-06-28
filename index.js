import fs from "fs";
import ssh2 from "ssh2";
import "dotenv/config";

let counter = 1;

const conn = new ssh2.Client().connect({
  host: process.env.HOST,
  port: process.env.PORT,
  username: process.env.USERNAME,
  password: process.env.PASSWORD,
});

conn.on("ready", () => {
  new ssh2.Server(
    {
      hostKeys: [fs.readFileSync("key/host.key")],
    },
    (client) => {
      const writeStream = fs.createWriteStream(`logs/log-${counter}.txt`);

      let user;

      counter += 1;

      console.log("Client connected!");

      client
        .on("authentication", (ctx) => {
          if (ctx.password?.length > 0) {
            user = ctx.username;
            writeStream.write(
              `SSHoney: Authentication: ${ctx.method} ${ctx.username} ${
                ctx.password
              } ${ctx?.key?.algo} ${ctx?.key?.data?.toString("hex")}\n`
            );
            ctx.accept();
          } else {
            return ctx.reject();
          }
        })
        .on("ready", () => {
          console.log("Client authenticated!");

          client.on("session", (accept, _) => {
            const session = accept();
            session.on("exec", (accept, _, info) => {
              const stream = accept();

              writeStream.write(`SSHoney: Exec: ${info.command}\n`);

              stream
                .on("date", (data) => {
                  writeStream.write(`SSHoney: Exec Data: ${data.toString()}\n`);
                })
                .on("close", () => {
                  stream.close();
                });

              conn.exec(info.command, (_, commandStream) => {
                commandStream
                  .on("data", (data) => {
                    stream.write(data);
                    writeStream.write(
                      `SSHoney: Result: ${data.toString().trim()}\n`
                    );
                  })
                  .on("exit", () => {
                    stream.end();
                    commandStream.close();
                  });
              });
            });
          });
        })
        .on("close", () => {
          console.log("Client disconnected");
        })
        .on("error", (err) => {
          writeStream.write(`SSHoney: Client Error: ${err}\n`);
        });
    }
  ).listen(22, function () {
    console.log("Listening on port " + this.address().port);
  });
});
