let HOST;
let PRODUCTION;
let BASE_URL;

const scheme = {
  HTTP: "http://",
  HTTPS: "https://",
};

if (process.env.NODE_ENV === "production") {
  PRODUCTION = true;
  HOST = "nei.web.ua.pt";
  BASE_URL = `${scheme.HTTPS}${HOST}`;
} else {
  PRODUCTION = false;
  HOST = "localhost";
  BASE_URL = `${scheme.HTTP}${HOST}`;
}

const config = {
  PRODUCTION,
  HOST,
  BASE_URL,
  API_NEI_URL: `${BASE_URL}/api/nei/v1`, // For authentication and user data
};

export default config;
