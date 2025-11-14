module.exports = {
  env: {
    node: true,
    es2021: true
  },
  extends: ["eslint:recommended", "google"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  rules: {
    "max-len": ["warn", { "code": 140 }],
    "require-jsdoc": "off",
    "quotes": ["error", "double"]
  }
};