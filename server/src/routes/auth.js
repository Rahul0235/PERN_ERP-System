import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { asyncHandler, AppError } from '../utils/errors.js';
const router=Router();
router.post('/login', asyncHandler(async(req,res)=>{
 const {email,password}=req.body||{};
 if(!email||!password) throw new AppError(400,'Email and password are required');
 const {rows}=await pool.query('SELECT id,name,email,password_hash,role FROM users WHERE lower(email)=lower($1)',[email]);
 if(!rows[0]||!(await bcrypt.compare(password,rows[0].password_hash))) throw new AppError(401,'Invalid email or password');
 if(!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
 const u=rows[0], token=jwt.sign({id:u.id,name:u.name,email:u.email,role:u.role},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'8h'});
 res.json({token,user:{id:u.id,name:u.name,email:u.email,role:u.role}});
}));
export default router;
