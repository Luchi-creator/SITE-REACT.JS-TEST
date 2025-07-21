const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3');
const app = express();
const port = 6789;

// Setăm 'view engine' pentru a folosi EJS
app.set('view engine', 'ejs');

// Suport pentru layout-uri
app.use(expressLayouts);

// Directorul 'public' conține resursele accesibile direct de către client
app.use(express.static('public'));

// Corpul mesajului poate fi interpretat ca JSON
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware pentru gestionarea cookie-urilor
app.use(cookieParser());

// Middleware pentru gestionarea sesiunilor
app.use(session({
    secret: 'secretulCheieSesiune', // Cheia secretă pentru semnarea cookie-urilor de sesiune
    resave: false,
    saveUninitialized: true
}));

function connectDB() {
    return new sqlite3.Database('cumparaturi.db');
}

// Conectare la baza de date
var db = connectDB();

// Endpoint pentru pagina principală
app.get('/', (req, res) => {
    db.all('SELECT * FROM produse', (err, rows) => {
        if (err) {
            console.error('Eroare la obținerea produselor din baza de date:', err);
            res.status(500).send('Eroare la obținerea produselor.');
        } else {
            const produse = rows;
            res.render('index', { title: 'Home', utilizator: req.session.utilizator, produse: produse });
        }
    });
});
// Pagina de autentificare
app.get('/autentificare', (req, res) => {
    res.render('autentificare', { title: 'Autentificare' });
});

// Ruta pentru verificarea autentificării
app.post('/verificare_autentificare', async (req, res) => {
    const { utilizator, parola } = req.body;
    const utilizatori = await citesteUtilizatoriDinJSON();
    if (!utilizatori) {
        res.status(500).send('Eroare la citirea utilizatorilor.');
        return;
    }
    // Verificăm dacă utilizatorul și parola sunt corecte
    const utilizatorGasit = utilizatori.find(usr => usr.username === utilizator && usr.password === parola);
    if (utilizatorGasit) {
        req.session.utilizator = utilizatorGasit;
        res.redirect("/");
    } else {
        res.render('autentificare', { title: 'Autentificare', mesajEroare: 'Utilizator sau parolă incorectă.' });
    }
});

// Middleware pentru verificarea autentificării
function autentificareMiddleware(req, res, next) {
    if (req.session.utilizator) {
        next(); // Dacă utilizatorul este autentificat, continuă cu următoarea rută
    } else {
        res.redirect('/autentificare'); // Altfel, redirecționează la pagina de autentificare
    }
}

// Endpoint pentru pagina de chestionar
app.get('/chestionar', autentificareMiddleware, async (req, res) => {
    const intrebari = await citesteIntrebariDinJSON();
    res.render('chestionar', { intrebari: intrebari });
});

// Endpoint pentru primirea rezultatelor chestionarului
app.post('/rezultat-chestionar', autentificareMiddleware, async (req, res) => {
    const intrebari = await citesteIntrebariDinJSON();
    const raspunsuri = req.body;
    let raspunsuriCorecte = 0;

    intrebari.forEach((intrebare, index) => {
        if (parseInt(raspunsuri[`intrebare${index}`]) === intrebare.corect) {
            raspunsuriCorecte++;
        }
    });

    res.render('rezultat-chestionar', { raspunsuriCorecte: raspunsuriCorecte, totalIntrebari: intrebari.length });
});

// Funcție pentru citirea utilizatorilor dintr-un fișier JSON
async function citesteUtilizatoriDinJSON() {
    try {
        const data = await fs.readFile('utilizatori.json', 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Eroare la citirea fișierului utilizatori.json:', err);
        return null;
    }
}

// Funcție pentru citirea întrebărilor dintr-un fișier JSON
async function citesteIntrebariDinJSON() {
    try {
        const data = await fs.readFile('intrebari.json', 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Eroare la citirea fișierului intrebari.json:', err);
        return null;
    }
}



// Ruta pentru crearea bazei de date
app.get('/creare-bd', autentificareMiddleware, (req, res) => {
    db = connectDB();
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS produse (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nume TEXT NOT NULL,
                pret REAL NOT NULL
            )
        `);
    });
    db.close((err) => {
        if (err) {
            console.error('Eroare la închiderea bazei de date:', err);
            res.status(500).send('Eroare la crearea bazei de date.');
        } else {
            res.redirect('/');
        }
    });
});

// Ruta pentru inserarea produselor în baza de date
app.get('/inserare-bd', autentificareMiddleware, (req, res) => {
    const db = connectDB();
    const produse = [
        { nume: 'Produs 1', pret: 10.00 },
        { nume: 'Produs 2', pret: 20.00 },
        { nume: 'Produs 3', pret: 15.00 },
        { nume: 'Produs 4', pret: 40.00 },
        { nume: 'Produs 5', pret: 4.00 },
        { nume: 'Produs 6', pret: 420.00 },
        { nume: 'Produs 7', pret: 120.00 }
    ];
    db.serialize(() => {
        const stmt = db.prepare('INSERT INTO produse (nume, pret) VALUES (?, ?)');
        for (const produs of produse) {
            stmt.run(produs.nume, produs.pret);
        }
        stmt.finalize();
    });
    db.close((err) => {
        if (err) {
            console.error('Eroare la închiderea bazei de date:', err);
            res.status(500).send('Eroare la inserarea produselor.');
        } else {
            res.redirect('/');
        }
    });
});

app.post('/adaugare_cos', autentificareMiddleware, (req, res) => {
    const { id } = req.body;
    if (!req.session.cosCumparaturi) {
        req.session.cosCumparaturi = [];
    }
    req.session.cosCumparaturi.push(id);
    res.redirect('/');
});

// Endpoint pentru vizualizarea coșului de cumpărături
app.get('/vizualizare-cos', autentificareMiddleware, (req, res) => {
    const cosCumparaturi = req.session.cosCumparaturi || [];
    // Interogare pentru a obține detalii despre produsele din coșul de cumpărături
    db.all('SELECT * FROM produse WHERE id IN (?)', [cosCumparaturi], (err, produse) => {
        if (err) {
            console.error('Eroare la obținerea produselor din coșul de cumpărături:', err);
            res.status(500).send('Eroare la obținerea produselor din coșul de cumpărături.');
        } else {
            res.render('vizualizare-cos', { title: 'Vizualizare Coș', produseCos: produse });
        }
    });
});


// Pornirea serverului
app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:${port}`));
