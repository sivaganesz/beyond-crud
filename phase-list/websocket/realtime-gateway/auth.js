// auth.js
import jwt from "jsonwebtoken";

const SECRET = "phase1secret";
// const demo = createToken("santhosh");
export function createToken(username) {
  const token = jwt.sign({ username }, SECRET, { expiresIn: "2h" });
  console.log(`Created token for ${username}:`, token);
  return token;
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}