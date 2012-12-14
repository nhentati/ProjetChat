var flatiron    = require('flatiron'),
    path        = require('path'),
    plates      = require('plates'),
    fs          = require("fs"),
    app = flatiron.app;

var mongodb = require('mongodb');
var Db = mongodb.Db,
    MongoServer = mongodb.Server;


var clientDb = new Db('socket', new MongoServer("127.0.0.1", 27017, {}));


app.config.file({ file: path.join(__dirname, 'config', 'config.json') });

app.use(flatiron.plugins.http, {
  
});

app.router.get('/', function () {
    console.log("homepage");
    var self = this ;
    fs.readFile(__dirname + '/index.html','utf-8', function (err, html) {

        if (err) {
            self.res.writeHead(404);
            return self.res.end('index.html introuvable');
        }
        //var content = { "content": "mon super TP à faire" };

        //html = plates.bind(html,content);
        //console.log("Le param html : " + html);
        self.res.writeHead(200,{'Content-Type': 'text/html;charset=utf-8'});
        self.res.end(html,'utf-8');

    });
});


app.router.get('/talk/:talkname', function (talkname) {
    console.log("talk:"+talkname);
    var self = this ;
    fs.readFile(__dirname + '/index.html','utf-8', function (err, html) {

        if (err) {
            self.res.writeHead(404);
            return self.res.end('index.html introuvable');
        }
        var http_code = 404;
        var content = { "content": "la page demandée n'existe pas" };
        collectionTalk.find({name:talkname}).toArray(function(err, results) {
            if (results.length>0)
            {
                http_code= 200;
                content.content = '<ol id="talk">';
                var partial = '<li><div class="time"></div><div class="pseudo"></div><div class="text"></div></li>';
                for (var i = 0; i < results[0].line.length; i++) {
                    console.log(results[0].line[i]);
                    var mytime = { "pseudo": "Thu Nov 29 2012 16:29:00 GMT+0100 (CET)" };
                    var map = plates.Map();
                    //console.log(map.where('class').is('pseudo'));
                    map.where('class').is('pseudo').use('pseudo');
                    map.where('class').is('time').use('time');
                    map.where('class').is('text').use('text');
                    //var html_line = plates.bind(partial,results[0].line[i],map);
                    var html_line = plates.bind(partial,results[0].line[i],map);
                    console.log(html_line);
                    content.content += html_line;
                }
                content.content += "</ol>";
                html = plates.bind(html,content);
                //console.log(html);
                self.res.writeHead(http_code,{'Content-Type': 'text/html;charset=utf-8'});
                self.res.end(html,'utf-8');

       //content = { "content":  };
            }
        });

    });
});

app.start(3000, function () {
    console.log('Application is now started on port 3000');
});


// Variables globales
// Ces variables resteront durant toute la vie du seveur pour et sont commune pour chaque client (node server.js)
// liste des messages de la forme { pseudo : 'Mon pseudo', message : 'Mon message' }
var messages = [];

var io = require('socket.io').listen(app.server);
var collectionTalk = null;

clientDb.open(function(err, client) {
    client.collection('talk', function(err, collection) {
        collectionTalk = collection;
    });
});

io.sockets.on('connection', function(socket) {
    // socket.on('login', function(data) {
    //     if (data.pseudo)
    //     {
    //         console.log("nouveau chatteur:"+data.pseudo)
    //     }else
    //     {
    //         console.log("pas de pseudo!");
    //     }
    // });

     // On donne la liste des messages (evenement cree du cote client)
    socket.emit('recupererMessages', messages);
    // Quand on recoit un nouveau message
    socket.on('nouveauMessage', function (mess) {
        // On l'ajout au tableau (variable globale commune a tous les clients connectes au serveur)
        messages.push(mess);
        // On envoie a tout les clients connectes (sauf celui qui a appelle l'evenement) le nouveau message
        socket.broadcast.emit('recupererNouveauMessage', mess);
    });
});
