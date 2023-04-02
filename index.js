import express from "express";
import { config } from "dotenv";
import userModel from "./models/userModel.js";
import permissionModel from "./models/permissionModel.js";
import channelModel from "./models/channelModel.js";
import messageModel from "./models/messagesModel.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";

config();

const app = express();

app.use(express.json());

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.set("view engine", "ejs");

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hey welcome.");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Ejs
app.get("/register", (req, res) => {
  res.render("register");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/reset-pass", (req, res) => {
  res.render("accInvite");
});

app.get("/add-channel", (req, res) => {
  res.render("addChannel");
});

// User Api

app.post("/api/users/register", async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    const isEmailExist = await userModel.findOne({
      email,
    });
    if (isEmailExist) {
      return res.status(400).json({
        status: "error",
        message: "Email already exist",
      });
    }
    const user = new userModel({
      email,
      password,
      name,
      role,
    });
    const response = await user.save();
    return res.status(200).json({
      status: "success",
      message: "User registered successfully",
      data: response,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

app.post("/api/users/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    // console.log(email, password);
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required",
      });
    }
    const response = await userModel.findOne({
      $and: [
        {
          email,
        },
        {
          password,
        },
      ],
    });
    if (!response) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email or password",
      });
    }
    const jwtToken = jwt.sign(
      {
        email: response.email,
        role: response.role,
      },
      process.env.ACCESS_TOKEN,
      {
        expiresIn: "1h",
      }
    );
    return res.status(200).json({ data: response, token: jwtToken });
  } catch (error) {
    return res.status(500).json(error);
  }
});

app.post(
  "/api/users/accept-invitation-and-change-password",
  async (req, res) => {
    try {
      const decodedToken = jwt.verify(
        req.query.token,
        process.env.ACCESS_TOKEN
      );
      const { email } = decodedToken;
      const { password } = req.body;
      const query = await userModel.findOne({
        email,
      });
      if (!query) {
        return res.status(400).json({
          status: "error",
          message: "Invalid email",
        });
      }
      query.password = password;
      await query.save();
      console.log(query);
      const response = await permissionModel.find({
        email,
      });
      for (let i = 0; i < response.length; i++) {
        console.log(response[i]._id);
        const permission = await permissionModel.findOne({
          _id: response[i]._id,
        });
        permission.invitationStatus = "accepted";
        await permission.save();
      }
      return res.status(200).json({
        status: "success",
        message: "Invitation Accepted successfully",
      }); 
    } catch (error) {
      console.log(error);
      return res.status(500).json(error);
    }
  }
);

app.post("/api/admin/add-channel", async (req, res) => {
  try {
    // Get token from header
    if (!req.headers.authorization) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
    // Check if user is admin
    if (decodedToken.role !== "admin") {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    // Check if channel name already exist
    if (!req.body.name) {
      return res.status(400).json({
        status: "error",
        message: "Channel name is required",
      });
    }
    const IsNameExist = await channelModel.findOne({
      name: req.body.name,
    });
    if (IsNameExist) {
      return res.status(400).json({
        status: "error",
        message: "Channel name already exist",
      });
    }
    // Add channel
    const channel = new channelModel({
      name: req.body.name,
    });
    const response = await channel.save();
    return res.status(200).json({
      status: "success",
      message: "Channel added successfully",
      data: response,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

app.post("/api/admin/invite-user", async (req, res) => {
  try {
    // Get token from header
    if (!req.headers.authorization) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
    // Check if user is admin
    if (decodedToken.role !== "admin") {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const { email, channelAndPermissions } = req.body;
    if (!email || !channelAndPermissions) {
      return res.status(400).json({
        status: "error",
        message: "Email and channelAndPermissions are required",
      });
    }
    // Check if email already exist
    const isEmailExist = await userModel.findOne({
      email,
    });
    if (isEmailExist) {
      return res.status(400).json({
        status: "error",
        message: "Email already exist in the system can't invite",
      });
    } else {
      // Add user
      const user = new userModel({
        email,
        role: "user",
      });
      await user.save();
      // Add permission
      for (let i = 0; i < channelAndPermissions.length; i++) {
        const permission = new permissionModel({
          email: email,
          channelName: channelAndPermissions[i].channelName,
          readPermission: channelAndPermissions[i].readPermission
            ? true
            : false,
          writePermission: channelAndPermissions[i].writePermission
            ? true
            : false,
          editPermission: channelAndPermissions[i].editPermission
            ? true
            : false,
        });
        await permission.save();
      }
      // Send email
      const token = jwt.sign(
        {
          email,
        },
        process.env.ACCESS_TOKEN,
        {
          expiresIn: "1h",
        }
      );
      const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 587,
        auth: {
          user: process.env.GMAIL_EMAIL,
          pass: process.env.GMAIL_PASSWORD,
        },
      });
      const url = `http://localhost:3000/accept-invitation?token=${token}`;
      const mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: "Invitation to join the channel",
        html: `<p>Click on the link below to accept the invitation</p>
                <a href="${url}">${url}</a>`,
      };
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.log(error);
        }
        console.log("Email sent: " + info.response);
      });
    }
    return res.status(200).json({
      status: "success",
      message: "Invitation sent successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

app.post("/api/admin/edit-user-permission", async (req, res) => {
  try {
    // Get token from header
    if (!req.headers.authorization) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
    // Check if user is admin
    if (decodedToken.role !== "admin") {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const { email, channelAndPermissions } = req.body;
    if (!email || !channelAndPermissions) {
      return res.status(400).json({
        status: "error",
        message: "Email and channelAndPermissions are required",
      });
    }
    const permission = await permissionModel.findOne({
      email,
    });
    if (!permission) {
      return res.status(400).json({
        status: "error",
        message: "User not found",
      });
    }
    // Update permission
    for (let i = 0; i < channelAndPermissions.length; i++) {
      const permission = channelAndPermissions[i];
      const entry = await permissionModel.findOne({
        $and: [
          {
            email: email,
          },
          {
            channelName: permission.channelName,
          },
        ],
      });
      if (entry) {
        entry.readPermission = permission.readPermission ? true : false;
        entry.writePermission = permission.writePermission ? true : false;
        entry.editPermission = permission.editPermission ? true : false;
        await entry.save();
      }
      if (!entry) {
        const newPermission = new permissionModel({
          email: email,
          channelName: permission.channelName,
          readPermission: permission.readPermission ? true : false,
          writePermission: permission.writePermission ? true : false,
          editPermission: permission.editPermission ? true : false,
          invitationStatus: "accepted",
        });
        await newPermission.save();
      }
    }
    return res.status(200).json({
      status: "success",
      message: "Permission updated successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

app.get("/api/admin/get-channels", async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
    // Check if user is admin
    if (decodedToken.role !== "admin") {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const channels = await channelModel.find();
    return res.status(200).json({
      status: "success",
      channels,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

app.get("/api/admin/get-users", async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
    // Check if user is admin
    if (decodedToken.role !== "admin") {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const users = await userModel.find({
      role: "user",
    });
    const userList = [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const permission = await permissionModel.find({
        email: user.email,
      });
      const userObj = {
        email: user.email,
        permission,
      };
      userList.push(userObj);
    }
    return res.status(200).json({
      status: "success",
      users: userList,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

app.get("/api/users/get-channels", async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
    // Check if user is admin
    if (decodedToken.role !== "user") {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const channelList = await permissionModel.find({
      email: decodedToken.email,
    });
    if (!channelList) {
      return res.status(200).json({
        status: "success",
        channels: [],
      });
    }
    return res.status(200).json({
      status: "success",
      channels: channelList,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

app.get("/api/users/read-channel-messages", async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
    // Check if user is admin
    if (decodedToken.role !== "user") {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const channelName = req.query.channelName;
    if (!channelName) {
      return res.status(400).json({
        status: "error",
        message: "Channel name is required",
      });
    }
    const isPermission = await permissionModel.findOne({
      $and: [
        {
          email: decodedToken.email,
        },
        {
          channelName,
        },
        {
          readPermission: true,
        },
      ],
    });
    if (!isPermission) {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const messages = await messageModel.find({
      channelName,
    });
    if (!messages) {
      return res.status(200).json({
        status: "success",
        messages: [],
      });
    } else {
      return res.status(200).json({
        status: "success",
        messages: messages,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

app.post("/api/users/write-channel-message", async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
    // Check if user is admin
    if (decodedToken.role !== "user") {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const channelName = req.query.channelName;
    if (!channelName) {
      return res.status(400).json({
        status: "error",
        message: "Channel name is required",
      });
    }
    const isPermission = await permissionModel.findOne({
      $and: [
        {
          email: decodedToken.email,
        },
        {
          channelName,
        },
        {
          writePermission: true,
        },
      ],
    });
    if (!isPermission) {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const message = req.body.message;
    if (!message) {
      return res.status(400).json({
        status: "error",
        message: "Message is required",
      });
    }
    const newMessage = new messageModel({
      channelName,
      message,
      email: decodedToken.email,
    });
    await newMessage.save();
    return res.status(200).json({
      status: "success",
      message: "Message sent successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

app.get("/api/users/edit-channel-message", async (req, res) => {
  try {
    if (!req.headers.authorization) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(400).json({
        status: "error",
        message: "Token is required",
      });
    }
    // Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN);
    // Check if user is admin
    if (decodedToken.role !== "user") {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const channelName = req.query.channelName;
    if (!channelName) {
      return res.status(400).json({
        status: "error",
        message: "Channel name is required",
      });
    }
    const isPermission = await permissionModel.findOne({
      $and: [
        {
          email: decodedToken.email,
        },
        {
          channelName,
        },
        {
          editPermission: true,
        },
      ],
    });
    if (!isPermission) {
      return res.status(400).json({
        status: "error",
        message: "You are not authorized to perform this action",
      });
    }
    const message = req.body.message;
    if (!message) {
      return res.status(400).json({
        status: "error",
        message: "Message is required",
      });
    }
    const messageId = req.body.messageId;
    if (!messageId) {
      return res.status(400).json({
        status: "error",
        message: "Message id is required",
      });
    }
    const isMessage = await messageModel.findById(messageId);
    if (!isMessage) {
      return res.status(400).json({
        status: "error",
        message: "Message does not exist",
      });
    }
    isMessage.message = message;
    isMessage.isEdited = true;
    await isMessage.save();
    return res.status(200).json({
      status: "success",
      message: "Message edited successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

//ejs
