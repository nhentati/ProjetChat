var flatiron    = require('flatiron'),
    path        = require('path'),
    plates      = require('plates'),
    fs          = require("fs"),
    app = flatiron.app;

var mongodb = require('mongodb');
var Db = mongodb.Db,
    MongoServer = mongodb.Server;


var clientDb = new Db('bdd_projet_chat', new MongoServer("127.0.0.1", 27017, {auto_reconnect:true}));


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

        var left = { "left": "la page demandée n'existe pas" };
        collectionTalk.find({}).toArray(function(err, results) {
            if (results.length>0){
                http_code= 200;
                left.left = '<span style="font-weight:bold;">Liste des permalinks</span>';
                left.left += '<ul id="listePermalinks">';
                for (var i = 0; i < results.length; i++) {
                    left.left += '<li><a href="/talk/' + results[i].permalink + '" class="permalink">' + results[i].permalink + '</a></li>';
                }
                left.left += "</ul>";
                html = plates.bind(html,left);
                self.res.writeHead(200,{'Content-Type': 'text/html;charset=utf-8'});
                self.res.end(html,'utf-8');
            }
        });        
    });
});


app.router.get('/talk/:talkname', function (talkname) {
    console.log("talk:"+talkname);
    var self = this ;
    fs.readFile('talk/index.html','utf-8', function (err, html) {

        if (err) {
            self.res.writeHead(404);
            return self.res.end('index.html introuvable');
        }
        var http_code = 404;
        var content = { "content": "la page demandée n'existe pas" };

        // recherche du contenu du permalink
        collectionTalk.find({permalink:talkname}).toArray(function(err, results) {
            if (results.length>0)
            {
                http_code= 200;
                content.content = 'Salon : ' + results[0].messages[0].salon;
                content.content += '<ul id="talk">';
                var partial = '<li><span class="pseudo"></span> : <span class="message"></span></li>';
                for (var i = 0; i < results[0].messages.length; i++) {
                    console.log(results[0].messages[i]);
                    var map = plates.Map();
                    map.where('class').is('pseudo').use('pseudo');
                    map.where('class').is('message').use('message');
                    var html_messages = plates.bind(partial,results[0].messages[i],map);
                    console.log(html_messages);
                    content.content += html_messages;
                }
                content.content += "</ul>";

                // talk precedent - suivant
                var precedent = "";
                var suivant = "";
                var navigation = { "navigation": "" };
                collectionTalk.find({}, {sort: {_id: 1}}).toArray(function(err, resultats) {
                    for (var i = 0; i < resultats.length; i++) {
                        if(String(resultats[i]._id) == String(results[0]._id)) {
                            if(resultats[i - 1]) {  
                                precedent = resultats[i - 1];
                            }
                            if(resultats[i + 1]) {
                                suivant = resultats[i + 1];
                            }
                            break;
                        }

                    }
                    if (precedent != "") {
                        navigation.navigation = '<a href="' + precedent.permalink + '" class="permalink">' + ' Precedent</a>';
                        if (suivant != "") {
                            navigation.navigation += ' | ';    
                        }
                    }
                    if (suivant != "") {
                        navigation.navigation += '<a href="' + suivant.permalink + '" class="permalink">' + ' Suivant</a>';
                    }
                    html = plates.bind(html,navigation);
                    html = plates.bind(html,content);
                    self.res.writeHead(http_code,{'Content-Type': 'text/html;charset=utf-8'});
                    self.res.end(html,'utf-8');
                    
                });
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
var intervalle = 300000;
var salons = [];
salons.push({'salon' : 'Principal'});
var intervalleTwits = 20000;

var io = require('socket.io').listen(app.server);
var collectionTalk = null;

clientDb.open(function(err, client) {
    client.collection('talk', function(err, collection) {
        collectionTalk = collection;
    });
});

io.sockets.on('connection', function(socket) {
    // On donne la liste des messages (evenement cree du cote client)
    socket.emit('recupererMessages', messages);

    // Quand on recoit un nouveau message
    socket.on('nouveauMessage', function (mess) {
        // On l'ajout au tableau (variable globale commune a tous les clients connectes au serveur)
        messages.push(mess);
        // On envoie a tout les clients connectes (sauf celui qui a appelle l'evenement) le nouveau message
        socket.broadcast.emit('recupererNouveauMessage', mess);        
    });

    socket.emit('recupererSalons', salons);

    // Quand on cree un nouveau salon
    socket.on('nouveauSalon', function (salon) {
        // On l'ajout au tableau (variable globale commune a tous les clients connectes au serveur)
        salons.push(salon);
        // On envoie a tout les clients connectes (sauf celui qui a appelle l'evenement) les salons
        socket.broadcast.emit('recupererSalons', salons);        
    });

    setInterval(function(){
        // recuperer le timeout actuel
        var timeoutActuel = new Date().getTime();

        if (messages.length > 0) {
            // recuperer dernier message
            var timeoutDernierMessage = messages[messages.length - 1].time;

            // test si timeoutDernierMessage + intervalle < timeoutActuel => historique
            if ((timeoutDernierMessage + intervalle) < timeoutActuel) {
                console.log("historique......................................");

                var initiateur = messages[0].pseudo;
                var premierePhrase = "";
                var permalink = "";

                // Recuperation des 5 premiers mots de l'initiateur
                for(var i = 0; i < messages.length; i++) {
                    txt = messages[i];
                    if(txt.pseudo == initiateur && txt.message.split(" ").length >= 5) {
                        premierePhrase = txt.message;
                        break;
                    }
                }

                // s'il n'y a aucune phrase contenant 5 mots, on prend la premiere phrase + datetime
                if(premierePhrase == "") {
                    var dateCourante = new Date();
                    premierePhrase = messages[0].message + "_" + dateCourante.getHours() + "h" + dateCourante.getMinutes() + "min";
                }

                // constitution du permalink
                permalink = initiateur + "-" +  premierePhrase.split(' ').join('-').split('?').join('').split('&').join('-').split('#').join('-');  

                // insertion en BDD
                var donnee =    {   'permalink'  : permalink,
                                    'premierePhrase' : premierePhrase,
                                    'messages' : messages
                                };

                console.log(donnee);

                clientDb.collection("talk", function(err, collection) {
                    collection.insert(donnee);
                });

                // effacer le contenu de messages
                messages = [];

            }
            //sinon rien a faire
        }
    }, intervalle);

    // recuperation des twits aleatoirement sur un salon pris aléatoirement
    setInterval(function() {
        if (salons.length > 1) {
            var randomIndex = Math.floor(Math.random() * salons.length);
            if (salons[randomIndex].salon != "" && salons[randomIndex].salon != "Principal") {
                console.log("Random salon : " + salons[randomIndex].salon);
                var http = require('http');
                var motRecherche = salons[randomIndex].salon;

                var options = {
                    host: 'search.twitter.com',
                    port: 80,
                    path: '/search.json?q='+motRecherche
                };

                var resultatTwitter = [];
                var twits = [];

                var req = http.request(options, function(res) {
                    res.setEncoding('utf8');
                    res.on('data', function (chunk) {
                        resultatTwitter.push(chunk);
                    });

                    res.on('end', function() {
                        if (resultatTwitter.length > 0) {
                            twits = JSON.parse(resultatTwitter.join('')).results;
                            var indice = Math.floor(Math.random() * twits.length);
                            console.log("Affichage dans la méthode :" + twits[indice].from_user +" : "+twits[indice].text);
                            var mess = { 'pseudo' : twits[indice].from_user, 'message' : twits[indice].text, 'time' : new Date().getTime(), 'salon' : motRecherche };
                            messages.push(mess);
                            socket.broadcast.emit('recupererNouveauMessage', mess); 
                        }
                    });
                });

                req.on('error', function(e) {
                    console.log('problem with request: ' + e.message);
                });

                req.end();
            }    
        }
    }, intervalleTwits);

});
