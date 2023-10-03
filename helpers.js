const fs = require('fs');

const redirectLogin = (req, res, next) => {
  if (!req.session.username) {
    res.redirect('/login');
  } else {
    next();
  }
};
const redirectHome = (req, res, next) => {
  if (req.session.username) {
    res.redirect('/');
  } else {
    next();
  }
};
const readOptions = () => {
  let rawData = fs.readFileSync('data/options.json');
  let options = JSON.parse(rawData);
  return options;
};

module.exports = {
  redirectLogin: redirectLogin,
  redirectHome: redirectHome,
  readOptions: readOptions,
};
