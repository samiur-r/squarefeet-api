import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  OneToMany,
} from 'typeorm';

import { IUser } from './interfaces';
import { IOtp } from '../otps/interfaces';
import { ITransaction } from '../transactions/interfaces';
import { IAgent } from '../agents/interfaces';

@Entity('users')
export class User extends BaseEntity implements IUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', unique: true, nullable: true })
  phone: string;

  @Column()
  password: string;

  @Column()
  status: string;

  @Column({
    default: false,
  })
  is_agent: boolean;

  @Column({
    default: false,
  })
  is_admin: boolean;

  @Column({
    nullable: true,
  })
  admin_comment: string;

  @OneToMany('Otp', 'user')
  otp: IOtp[];

  @OneToMany('Transaction', 'user')
  transaction: ITransaction[];

  @OneToMany('Agent', 'user')
  agent: IAgent;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
