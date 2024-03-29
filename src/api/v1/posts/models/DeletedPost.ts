import {
  Entity,
  Column,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

import { IPost } from '../interfaces';

import { IUser } from '../../users/interfaces';
import { User } from '../../users/model';

@Entity('deleted_posts')
export class DeletedPost extends BaseEntity implements IPost {
  @PrimaryColumn()
  id: number;

  @Column()
  title: string;

  @ManyToOne(() => User, { nullable: false, eager: true })
  @JoinColumn({ name: 'user_id' })
  user: IUser;

  @Column()
  city_id: number;

  @Column()
  city_title: string;

  @Column()
  state_id: number;

  @Column()
  state_title: string;

  @Column()
  category_id: number;

  @Column()
  category_title: string;

  @Column()
  property_id: number;

  @Column()
  property_title: string;

  @Column({ nullable: true })
  price: number;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  credit_type: string;

  @Column()
  post_type: string;

  @Column({
    default: 0,
    type: 'float',
  })
  views: number;

  @Column({ default: false })
  is_sticky: boolean;

  @Column({
    default: false,
  })
  is_reposted: boolean;

  @Column({
    default: 0,
  })
  repost_count: number;

  @Column()
  expiry_date: Date;

  @Column()
  public_date: Date;

  @Column({ nullable: true })
  posted_date: Date;

  @Column({ nullable: true })
  sticked_date: Date;

  @Column({ nullable: true })
  sticky_expires: Date;

  @Column({ nullable: true })
  repost_date: Date;

  @Column('text', { array: true, nullable: true })
  media: string[];

  @Column({ nullable: true })
  deleted_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
