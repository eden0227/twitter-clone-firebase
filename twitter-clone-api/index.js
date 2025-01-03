let express = require("express");
let path = require("path");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { DATABASE_URL, SECRET_KEY } = process.env;

let app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    require: true,
  },
});

async function getPostgresVersion() {
  const client = await pool.connect();
  try {
    const response = await client.query("SELECT version()");
    console.log(response.rows[0]);
  } finally {
    client.release();
  }
}

getPostgresVersion();

app.post("/signup", async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    const userResult = await client.query(
      "SELECT * FROM users WHERE username = $1",
      [username],
    );

    if (userResult.rows.length > 0) {
      return res.status(400).json({ message: "Username already exists." });
    }

    await client.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hashedPassword],
    );

    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    console.error("Error: ", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.post("/login", async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT * FROM users WHERE username = $1",
      [req.body.username],
    );

    const user = result.rows[0];

    if (!user)
      return res
        .status(400)
        .json({ message: "Username or password incorrect" });

    const passwordIsValid = await bcrypt.compare(
      req.body.password,
      user.password,
    );
    if (!passwordIsValid)
      return res.status(401).json({ auth: false, token: null });

    var token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, {
      expiresIn: 86400,
    });
    res.status(200).json({ auth: true, token: token });
  } catch (error) {
    console.error("Error: ", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/username", (req, res) => {
  const authToken = req.headers.authorization;

  if (!authToken) return res.status(401).json({ error: "Access Denied" });

  try {
    const verified = jwt.verify(authToken, SECRET_KEY);
    res.json({ username: verified.username });
  } catch (err) {
    res.status(400).json({ error: "Invalid Token" });
  }
});

app.get("/posts/user/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const client = await pool.connect();

  try {
    const posts = await client.query('SELECT * FROM posts WHERE user_id = $1', [user_id]);
    if (posts.rowCount > 0) {
      res.json(posts.rows);
    } else {
      res.status(404).json({ error: 'No posts found for this user' });
    }
  } catch (error) {
    console.error('Error', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.post('/posts', async (req, res) => {
  const { title, content, user_id } = req.body;
  const client = await pool.connect();
  try {
    const userExists = await client.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userExists.rows.length > 0) {
      const post = await client.query('INSERT INTO posts (title, content, user_id, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *', [title, content, user_id]);
      res.json(post.rows[0]);
    } else {
      res.status(400).json({ error: "User does not exist" });
    }
  } catch (err) {
    console.log(err.stack);
    res.status(500).json({ error: "Something went wrong, please try again later!" });
  } finally {
    client.release();
  }
});

// app.post('/likes', async (req, res) => {
//   const { user_id, post_id } = req.body;
// 
//   const client = await pool.connect();
// 
//   try {
//     const newLike = await client.query('INSERT INTO likes (user_id, post_id, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING *', [user_id, post_id]);
//     res.json(newLike.rows[0])
//   } catch (err) {
//     console.log(err.stack);
//     res.status(500).send('An error occured, please try again.');
//   } finally {
//     client.release();
//   }
// });

app.post('/likes', async (req, res) => {
  const { user_id, post_id } = req.body;
  const client = await pool.connect();
  
  try {
    const prevLike = await client.query(`
      SELECT * FROM LIKES WHERE user_id = $1 AND post_id = $2 AND active = false
    `, [user_id, post_id]);

    if (prevLike.rowCount > 0) {
      const newLike = await client.query(`
        UPDATE likes SET active = true WHERE id = $1 RETURNING *
      `, [prevLike.rows[0].id]);
      res.json(newLike.rows[0]);
    } else {
      const newLike = await client.query(`
        INSERT INTO likes (user_id, post_id, created_at, active)
        VALUES ($1, $2, CURRENT_TIMESTAMP, true)
        RETURNING *
      `, [user_id, post_id]);
      res.json(newLike.rows[0]);
    }
  } catch (error) {
    console.error('Error', error.message)
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
})

app.put('/likes/:userId/:postId', async (req, res) => {
  const { userId, postId } = req.params;
  const client = await pool.connect();

  try {
    await client.query(`
      UPDATE likes
      SET active = false
      WHERE user_id = $1 AND post_id = $2 AND active = true
    `, [userId, postId]);
    res.json({ message: "The like has been removed successfully!" })
  } catch (error) {
    console.error('Error', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get('/likes/posts/:post_id', async (req, res) => {
  const { post_id } = req.params;
  const client = await pool.connect();
  try {
    const likes = await client.query(`
      SELECT users.username
      FROM likes
      INNER JOIN users ON likes.user_id = users.id
      WHERE likes.post_id = $1
    `, [post_id]);
    res.json(likes.rows)  
  } catch (err) {
    console.error(err.stack);
    res.status(500).send('An error occured, please try again.');
  } finally {
    client.release();
  }
});

app.get('/likes/post/:post_id', async(req, res) => {
  const { post_id } = req.params;
  const client = await pool.connect();

  try {
    const likes = await client.query(`
      SELECT users.username, users.id AS user_id, likes.id AS likes_id
      FROM LIKES
      INNER JOIN users ON likes.user_id = users.id
      WHERE likes.post_id = $1 AND active = true
    `, [post_id])
    res.json(likes.rows)
  } catch (error) {
    console.error('Error', error.message)
    res.status(500).json({ error: error.message })
  } finally {
    client.release();
  }
})

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname + "/index.html"));
});

app.listen(5000, () => {
  console.log("App is listening on port 5000");
});
