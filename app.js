/* HELPER FUNCTIONS */
const { redirectLogin, redirectHome, readOptions } = require('./helpers');
/* HELPER PACKAGES */
const bodyParser = require('body-parser');

/* SETTING UP EXPRESS (CREATING WEB APP & SESSION) */
const express = require('express');
const app = express();

const session = require('express-session');
const SESS_NAME = 'sicktem_login';

app.set('view engine', 'ejs');
app.use(express.static('app'));
app.use(express.static('public'));
app.use(
  session({
    name: SESS_NAME,
    resave: false,
    saveUninitialized: false,
    secret: "i/ain't/gonna/tell/you/that",
    cookie: {
      sameSite: true,
    },
  })
);
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

/* CREATING SQL DATA BASE CONNECTION */
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(
  './data/see.db',
  sqlite3.OPEN_READWRITE,
  (err) => {
    if (err) return console.error(err.msg);
  }
);

/* CREATING MONGO DATA BASE CONNECTION */
const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/seeDB');

/* CREATING MONGO SCHEMAS & MODELS */
const clientSchema = new mongoose.Schema({
  name: String,
  phoneNumber: String,
});

const deviceSchema = new mongoose.Schema({
  deviceType: String,
  deviceStatus: String,
});

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  quantity: Number,
  category: String,
});

const receiptSchema = new mongoose.Schema({
  client: clientSchema,
  products: [{ quantity: Number, product: productSchema }],
  paid: { type: Boolean, default: false },
  discount: { type: Number, default: 0 },
  date: { type: Date, default: new Date() },
});

const reservationSchema = new mongoose.Schema({
  client: clientSchema,
  device: deviceSchema,
  deviceName: String,
  singleOrMulti: { type: String, default: 'Single' },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date, default: Date.now },
});

const shiftSchema = new mongoose.Schema({
  username: String,
  startDate: Date,
  endDate: Date,
});

const Client = mongoose.model('Client', clientSchema);
const Product = mongoose.model('Product', productSchema);
const Reservation = mongoose.model('Reservation', reservationSchema);
const Receipt = mongoose.model('Receipt', receiptSchema);
const Device = mongoose.model('Device', deviceSchema);
const Shift = mongoose.model('Shift', shiftSchema);

/* EXPRESS HANDLE REQUESTS */
app.get('/', redirectLogin, (req, res) => {
  const { alertMsg } = req.query;

  const promise1 = Reservation.find({});
  const promise2 = Product.find({});
  const promise3 = Device.find({});
  const promise4 = Client.find({});
  const promise5 = Receipt.find({});
  const promise6 = Shift.find({});

  Promise.all([
    promise1,
    promise2,
    promise3,
    promise4,
    promise5,
    promise6,
  ]).then((returnArr) => {
    const reservations = returnArr[0];
    const products = returnArr[1];
    const devices = returnArr[2];
    const clients = returnArr[3];
    const receipts = returnArr[4];
    const shifts = returnArr[5];

    let upComingReservations = [];
    let runningReservations = [];

    reservations.forEach((reservation) => {
      if (reservation.startTime > Date.now()) {
        upComingReservations.push(reservation);
      }
      if (
        reservation.startTime < Date.now() &&
        (reservation.endTime.getTime() == reservation.startTime.getTime() ||
          reservation.endTime > Date.now())
      ) {
        runningReservations.push(reservation);
      }
    });

    let match = [];

    devices.forEach((device) => {
      match = runningReservations.filter((reservation) => {
        return device._id.equals(reservation.device._id);
      });
      if (match.length) {
        device.state = 'active';
        device.reservation = match[0];
      } else {
        device.state = 'idle';
      }
    });

    const devicesTypes = Array.from(
      new Set(devices.map((device) => device.deviceType))
    );

    let devicesFiltered = {};

    devicesTypes.forEach((type) => {
      devicesFiltered[type] = devices.filter((device) => {
        return device.deviceType === type;
      });
    });

    let unPaidReceipts = receipts.filter((receipt) => {
      return !receipt.paid;
    });

    var activeShift = shifts.filter((shift) => (shift.endDate ? false : true));
    let shiftPaidReceipts;
    var shiftCash = 0;

    if (activeShift.length) {
      shiftPaidReceipts = receipts.filter((receipt) => {
        return (
          receipt.paid &&
          receipt.date.getTime() > activeShift[0].startDate.getTime()
        );
      });

      shiftPaidReceipts.forEach((receipt) => {
        const { discount, products } = receipt;
        let total = 0;
        products.forEach((productObj) => {
          total += productObj.quantity * productObj.product.price;
        });
        shiftCash += total - discount;
      });
    }

    unPaidReceipts.forEach((receipt) => {
      const { products } = receipt;
      let total = 0;
      products.forEach((productObj) => {
        total += productObj.quantity * productObj.product.price;
      });
      receipt.total = total;
    });

    res.render('index', {
      title: 'Sicktem | Home',
      localStyles: 'index',
      alertMsg: alertMsg,
      shift: activeShift,
      shiftCash: shiftCash,
      userType: req.session.userType,
      clients: clients,
      upComingReservations: upComingReservations,
      runningReservations: runningReservations,
      devices: devicesFiltered,
      devicesTypes: devicesTypes,
      receipts: unPaidReceipts,
      products: products,
    });
  });
});

app.get('/login', redirectHome, (req, res) => {
  let alertMsg = null;
  alertMsg = req.query.alertMsg;

  res.render('login', {
    alertMsg: alertMsg,
  });
});

app.get('/register', redirectHome, (req, res) => {
  let alertMsg = null;
  alertMsg = req.query.alertMsg;

  res.render('register', {
    alertMsg: alertMsg,
  });
});

app.get('/cash', redirectLogin, (req, res) => {
  Receipt.find({ paid: false }).then((receipts) => {
    receipts.forEach((receipt) => {
      const { products } = receipt;
      let total = 0;
      products.forEach((productObj) => {
        total += productObj.quantity * productObj.product.price;
      });
      receipt.total = total;
    });

    res.render('cash', {
      title: 'Sicktem | Cash Register',
      localStyles: 'cash',
      userType: req.session.userType,
      alertMsg: null,
      receipts: receipts,
    });
  });
});

app.get('/reservations', redirectLogin, (req, res) => {
  const { alertMsg } = req.query;

  const promise1 = Reservation.find({});
  const promise2 = Client.find({});
  const promise3 = Device.find({});

  Promise.all([promise1, promise2, promise3]).then((returnArr) => {
    const reservations = returnArr[0];
    const clients = returnArr[1];
    const devices = returnArr[2];

    const devicesTypes = Array.from(
      new Set(devices.map((device) => device.deviceType))
    );

    let devicesFiltered = {};

    devicesTypes.forEach((type) => {
      devicesFiltered[type] = devices.filter((device) => {
        return device.deviceType === type;
      });
    });

    res.render('reservations', {
      title: 'Sicktem | Reservations',
      localStyles: 'reservations',
      alertMsg: alertMsg,
      devices: devicesFiltered,
      devicesTypes: devicesTypes,
      reservations: reservations,
      clients: clients,
      userType: req.session.userType,
    });
  });
});

app.get('/clients', redirectLogin, (req, res) => {
  const alertMsg = req.query.alertMsg === undefined ? null : req.query.alertMsg;

  Client.find()
    .then(function (clients) {
      res.render('clients', {
        title: 'Sicktem | Clients',
        localStyles: 'clients',
        alertMsg: alertMsg,
        clients: clients,
        userType: req.session.userType,
      });
    })
    .catch(function (err) {
      res.redirect('/clients');
    });
});

app.get('/products', redirectLogin, (req, res) => {
  const promise1 = Product.find({});
  const promise2 = Device.find({});

  Promise.all([promise1, promise2]).then((returnArr) => {
    const products = returnArr[0];
    const devices = returnArr[1];

    const devicesTypes = Array.from(
      new Set(devices.map((device) => device.deviceType))
    );

    res.render('products', {
      title: 'Sicktem | Products',
      localStyles: 'products',
      products: products,
      devicesTypes: devicesTypes,
      userType: req.session.userType,
    });
  });
});

app.get('/users', redirectLogin, (req, res) => {
  const sql = 'SELECT * FROM users';
  let alertMsg = null;
  alertMsg = req.query.alertMsg;
  db.all(sql, (err, rows) => {
    res.render('users', {
      title: 'Sicktem | Users',
      localStyles: 'users',
      alertMsg: alertMsg,
      users: rows,
      userType: req.session.userType,
    });
  });
});

app.get('/devices', redirectLogin, (req, res) => {
  Device.find({}).then((devices) => {
    const devicesTypes = Array.from(
      new Set(devices.map((device) => device.deviceType))
    );

    let devicesFiltered = {};

    devicesTypes.forEach((type) => {
      devicesFiltered[type] = devices.filter((device) => {
        return device.deviceType === type;
      });
    });

    res.render('devices', {
      title: 'Sicktem | Devices ',
      localStyles: 'devices',
      devices: devicesFiltered,
      devicesTypes: devicesTypes,
      userType: req.session.userType,
    });
  });
});

app.get('/logout', redirectLogin, (req, res) => {
  req.session.username = null;
  req.session.userType = null;
  req.session.userId = null;
  res.redirect('/login');
});

app.get('/endTime', redirectLogin, (req, res) => {
  const { reservationId } = req.query;
  const now = new Date();

  Reservation.findOneAndUpdate(
    { _id: reservationId },
    { endTime: now },
    { new: false }
  ).then((reservation) => {
    const productName = `${reservation.device.deviceType} ${reservation.singleOrMulti}`;
    const { client } = reservation;
    const reservationLength =
      Math.round(
        (now.getTime() - reservation.startTime.getTime()) / (1000 * 60 * 30)
      ) / 2;

    const oldReservationLength =
      Math.round(
        (reservation.endTime.getTime() - reservation.startTime.getTime()) /
          (1000 * 60 * 30)
      ) / 2;

    const promise1 = Product.find({ name: productName });
    const promise2 = Receipt.find({ client: client });

    Promise.all([promise1, promise2]).then((returnArr) => {
      const product = returnArr[0].length ? returnArr[0][0] : undefined;
      if (!product) {
        Reservation.findOneAndUpdate(
          { _id: reservationId },
          { endTime: reservation.endTime }
        ).then(() => {
          return;
        });
        return res.redirect('/?alertMsg=noProductFound');
      }
      const receipts = returnArr[1].length ? returnArr[1] : undefined;
      var receipt;
      if (receipts) {
        [receipt] = receipts.filter((receipt) => {
          return receipt.paid == false;
        });
      }
      if (receipt && !receipt.paid) {
        let index = receipt.products.findIndex((prodObj) =>
          prodObj.product._id.equals(product._id)
        );
        if (index >= 0) {
          receipt.products[index].quantity += reservationLength
            ? reservationLength - oldReservationLength
            : 0.5 - oldReservationLength;
        } else {
          receipt.products.push({
            quantity: reservationLength
              ? reservationLength - oldReservationLength
              : 0.5 - oldReservationLength,
            product: product,
          });
        }
        receipt.save().then(() => {
          return res.redirect('/');
        });
      } else {
        let newReceipt = new Receipt({
          client: client,
          products: [
            {
              quantity: reservationLength
                ? reservationLength - oldReservationLength
                : 0.5 - oldReservationLength,
              product: product,
            },
          ],
        });
        newReceipt.save().then(() => {
          return res.redirect('/');
        });
      }
    });
  });
});

app.get('/deleteUser', redirectLogin, (req, res) => {
  const { userId, userType } = req.session;
  if (userType != 'ADMIN') {
    return res.redirect('/');
  }

  const userIdToChangePassword = req.query.id;
  if (userIdToChangePassword == userId) {
    return res.redirect(
      '/users?alertMsg=' + encodeURIComponent("You Can't delete your user!")
    );
  }
  const sql = `DELETE FROM users WHERE id=?`;
  db.run(sql, [userIdToChangePassword], (err) => {
    if (err) {
      return res.redirect(
        '/users?alertMsg=' +
          encodeURIComponent('Some Error Occurred, Please Try Again.')
      );
    } else {
      res.redirect('/users');
    }
  });
});

app.get('/deleteClient', redirectLogin, (req, res) => {
  const { clientId } = req.query;
  Client.deleteOne({ _id: clientId })
    .then(() => res.redirect('/clients'))
    .catch(() => {
      res.redirect('/clients');
    });
});

app.get('/deleteProduct', redirectLogin, (req, res) => {
  Product.deleteOne({ _id: req.query.productId })
    .then(() => res.redirect('/products'))
    .catch(() => res.redirect('/products'));
});

app.get('/deleteDevice', redirectLogin, (req, res) => {
  const { userType } = req.session;
  const { deviceId } = req.query;

  if (userType != 'ADMIN') {
    return res.redirect('/');
  }

  Device.deleteOne({ _id: deviceId }).then(() => {
    return res.redirect('devices');
  });
});

app.get('/deleteReservation', redirectLogin, (req, res) => {
  const { reservationId } = req.query;
  Reservation.deleteOne({ _id: reservationId })
    .then(res.redirect('/reservations'))
    .catch((err) => {
      console.log(err);
      res.redirect('/reservations');
    });
});

app.get('/payReceipt', redirectLogin, (req, res) => {
  const receiptId = req.query.id;

  Receipt.findOneAndUpdate(
    { _id: receiptId },
    { paid: true, date: Date() }
  ).then(() => {
    return res.redirect('/cash');
  });
});

app.get('/newShift', redirectLogin, (req, res) => {
  let shift = new Shift({
    username: req.session.username,
    startDate: new Date(),
  });

  shift.save().then(() => {
    return res.redirect('/');
  });
});

app.get('/endShift', redirectLogin, (req, res) => {
  const { shiftId } = req.query;
  Shift.findOneAndUpdate({ _id: shiftId }, { endDate: new Date() }).then(() => {
    return res.redirect('/');
  });
});

app.post('/login', redirectHome, (req, res) => {
  const { username, password } = req.body;

  const sql = `SELECT * FROM users WHERE username=? AND password=?`;
  db.all(sql, [username, password], (err, rows) => {
    if (err) {
      return res.render('login', {
        alertMsg: 'Some Error Occurred, Please Try Again.',
      });
    }

    if (rows.length > 0) {
      req.session.username = rows[0].username;
      req.session.userType = rows[0].user_type;
      req.session.userId = rows[0].id;
      return res.redirect('/');
    } else {
      return res.render('login', {
        alertMsg: 'Username or Password Incorrect',
      });
    }
  });
});

app.post('/register', redirectHome, (req, res) => {
  const { username, password, passwordConfirm } = req.body;

  const sql = `SELECT * FROM users WHERE username=?`;
  db.all(sql, [username], (err, rows) => {
    if (err) {
      return res.render('register', {
        alertMsg: 'Some Error Occurred, Please Try Again.',
      });
    }

    if (rows.length > 0) {
      return res.redirect(
        '/login?alertMsg=' +
          encodeURIComponent('Username already exists, Login Instead?')
      );
    } else if (username == '' || password == '') {
      return res.render('register', {
        alertMsg: null,
      });
    } else if (password != passwordConfirm) {
      return res.render('/register', {
        alertMsg: 'Password do not match!',
      });
    } else {
      const sql = `INSERT INTO users (username, password, user_type) VALUES (?, ?, ?)`;
      db.run(sql, [username, password, 'Cashier'], (err) => {
        if (err) {
          return res.redirect('/register', {
            alertMsg: 'Some Error Occurred, Please Try Again',
          });
        } else {
          req.session.username = username;
          req.session.userType = 'Chashier';
          req.session.userId = db.lastID;
          return res.redirect('/');
        }
      });
    }
  });
});

app.post('/orderProduct', redirectLogin, (req, res) => {
  const { productId, productQuantity, clientJson } = req.body;
  const clientObj = JSON.parse(clientJson);

  const promise1 = Product.find({ _id: productId });
  const promise2 = Receipt.find({ client: clientObj });

  Promise.all([promise1, promise2]).then((returnArr) => {
    const product = returnArr[0].length ? returnArr[0][0] : undefined;
    if (!product) {
      return res.redirect('/?alertMsg=noProductFound');
    }
    const receipts = returnArr[1].length ? returnArr[1] : undefined;
    const [receipt] = receipts.filter((receipt) => {
      return receipt.paid == false;
    });
    if (receipt && !receipt.paid) {
      let index = receipt.products.findIndex((prodObj) =>
        prodObj.product._id.equals(product._id)
      );
      if (index >= 0) {
        receipt.products[index].quantity += productQuantity;
      } else {
        receipt.products.push({
          quantity: productQuantity,
          product: product,
        });
      }
      receipt.save().then(() => {
        return res.redirect('/');
      });
    } else {
      let newReceipt = new Receipt({
        client: clientObj,
        products: [
          {
            quantity: productQuantity,
            product: product,
          },
        ],
      });
      newReceipt.save().then(() => {
        return res.redirect('/');
      });
    }
  });
});

app.post('/applyDiscount', redirectLogin, (req, res) => {
  const { discount } = req.body;
  const { receiptId } = req.query;

  Receipt.findOneAndUpdate({ _id: receiptId }, { discount: discount }).then(
    () => {
      return res.redirect('/cash');
    }
  );
});

app.post('/addReservation', redirectLogin, (req, res) => {
  const {
    clientName,
    clientPhoneNumber,
    reservationStartingTime,
    reservationDuration,
    singleOrMulti,
    clientObj,
    deviceObj,
    deviceId,
  } = req.body;

  let clientObject;

  if (!clientObj) {
    if (clientName && clientPhoneNumber) {
      clientObject = new Client({
        name: clientName,
        phoneNumber: clientPhoneNumber,
      });
      clientObject.save();
    }
  } else {
    clientObject = JSON.parse(clientObj);
  }

  Client.find({ _id: clientObject._id }).then(() => {
    let startTime = reservationStartingTime
      ? new Date(reservationStartingTime)
      : new Date();

    let endTime = startTime
      ? new Date(startTime.getTime() + 1000 * 60 * 60 * reservationDuration)
      : startTime;

    let reservation = new Reservation({
      client: clientObject,
      device: JSON.parse(deviceObj),
      deviceName: (parseInt(deviceId) + 1).toString(),
      singleOrMulti: singleOrMulti,
      startTime: startTime,
      endTime: endTime,
    });

    reservation
      .save()
      .then((reservation) => {
        const productName = `${reservation.device.deviceType} ${reservation.singleOrMulti}`;
        const { client } = reservation;
        const reservationLength =
          Math.round(
            (reservation.endTime.getTime() - reservation.startTime.getTime()) /
              (1000 * 60 * 30)
          ) / 2;

        const promise1 = Product.find({ name: productName });
        const promise2 = Receipt.find({ client: client });

        Promise.all([promise1, promise2]).then((returnArr) => {
          const product = returnArr[0].length ? returnArr[0][0] : undefined;
          if (!product) {
            Reservation.findOneAndUpdate(
              { _id: reservation._id },
              { endTime: reservation.startTime }
            ).then(() => {
              return;
            });
            return res.redirect('/?alertMsg=noProductFound');
          }
          const receipts = returnArr[1].length ? returnArr[1] : undefined;
          var receipt;
          if (receipts) {
            [receipt] = receipts.filter((receipt) => {
              return receipt.paid == false;
            });
          }
          if (receipt && !receipt.paid) {
            let index = receipt.products.findIndex((prodObj) =>
              prodObj.product._id.equals(product._id)
            );
            if (index >= 0) {
              receipt.products[index].quantity += reservationLength
                ? reservationLength
                : 0.5;
            } else {
              receipt.products.push({
                quantity: reservationLength ? reservationLength : 0.5,
                product: product,
              });
            }
            receipt.save().then(() => {
              return res.redirect('/');
            });
          } else {
            let newReceipt = new Receipt({
              client: client,
              products: [
                {
                  quantity: reservationLength ? reservationLength : 0.5,
                  product: product,
                },
              ],
            });
            newReceipt.save().then(() => {
              return res.redirect(req.get('Referrer'));
            });
          }
        });
      })
      .catch((err) => {
        return res.redirect('reservations?alertMsg=' + encodeURIComponent(err));
      });
  });
});

app.post('/addDevice', redirectLogin, (req, res) => {
  const { deviceType, deviceStatus } = req.body;

  let device = new Device({
    deviceType: deviceType,
    deviceStatus: deviceStatus,
  });

  device.save().then(() => {
    return res.redirect('devices');
  });
});

app.post('/addProduct', redirectLogin, (req, res) => {
  const { productName, productPrice, productCategory } = req.body;

  let product = new Product({
    name: productName,
    price: productPrice,
    category: productCategory,
  });

  product
    .save()
    .then(() => res.redirect('products'))
    .catch(() => {
      res.redirect('products');
    });
});

app.post('/addClient', redirectLogin, (req, res) => {
  const { clientName, clientPhoneNumber } = req.body;

  let client = new Client({
    name: clientName,
    phoneNumber: clientPhoneNumber,
  });

  client
    .save()
    .then(() => res.redirect('clients'))
    .catch(() => {
      res.redirect('clients');
    });
});

app.post('/addUser', redirectLogin, (req, res) => {
  const { username, password, userType } = req.body;
  if (username == '') {
    return res.redirect(
      '/users?alertMsg=' + encodeURIComponent('Please Provide A Username')
    );
  }

  let sql = `SELECT * FROM users WHERE username=?`;
  db.all(sql, [username], (err, rows) => {
    if (err) {
      return res.redirect(
        '/users?alertMsg=' +
          encodeURIComponent('Some Error Occurred, Please Try Again.')
      );
    }

    if (rows.length > 0) {
      return res.redirect(
        '/users?alertMsg=' + encodeURIComponent('Username already used')
      );
    } else {
      let sql = `INSERT INTO users (username, password, user_type) values (?, ?, ?)`;
      db.run(
        sql,
        [username, password == '' ? '123456' : password, userType],
        (err) => {
          if (err) {
            return res.redirect(
              '/users?alertMsg=' +
                encodeURIComponent('Some Error Occurred, Please Try Again.')
            );
          } else {
            res.redirect('/users');
          }
        }
      );
    }
  });
});

app.post('/changeUserPassword', redirectLogin, (req, res) => {
  const { userType } = req.session;
  if (userType != 'ADMIN') {
    return res.redirect('/');
  }

  const userIdToChangePassword = req.query.id;
  const { newPassword } = req.body;
  const sql = `UPDATE users SET password=? WHERE id=? `;
  db.run(sql, [newPassword, userIdToChangePassword], (err) => {
    if (err) {
      return res.redirect(
        '/users?alertMsg=' +
          encodeURIComponent('Some Error Occurred, Please Try Again.')
      );
    } else {
      res.redirect('/users');
    }
  });
});

app.post('/changeUserType', redirectLogin, (req, res) => {
  const { userId, userType } = req.session;
  const userIdToChangeType = req.query.id;
  const oldUserType = req.query.userType;
  const { newUserType } = req.body;

  if (userId == userIdToChangeType) {
    return res.redirect(
      '/users?alertMsg=' +
        encodeURIComponent("You can't change your user type.")
    );
  }

  let options = readOptions();

  if (options.roles.indexOf(userType) <= options.roles.indexOf(oldUserType)) {
    return res.redirect(
      '/users?alertMsg=' +
        encodeURIComponent(
          "You have to be of higher role to change another user's type."
        )
    );
  }

  if (options.roles.indexOf(newUserType) >= options.roles.indexOf(userType)) {
    return res.redirect(
      '/users?alertMsg=' +
        encodeURIComponent(
          "You can only change another user's role to a role lower than your's"
        )
    );
  }

  const sql = `UPDATE users SET user_type=? WHERE id=? `;
  db.run(sql, [newUserType, userIdToChangeType], (err) => {
    if (err) {
      return res.redirect(
        '/users?alertMsg=' +
          encodeURIComponent('Some Error Occurred, Please Try Again.')
      );
    } else {
      res.redirect('/users');
    }
  });
});

app.listen(process.env.PORT || 3000, function () {
  console.log('Server running on port 3000');
});
