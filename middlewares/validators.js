const { body, validationResult, check } = require('express-validator');
const mongoose = require('mongoose');
// const Church = require('../models/church'); 
// const User = require('../models/user'); 
const validateUser = () => [
    body('church').optional().notEmpty().withMessage('Please provide affiliated church'),
    body('firstName').notEmpty().withMessage('First Name is required'),
    body('lastName').notEmpty().withMessage('Last Name is required'),
    body('emailAddress').isEmail().withMessage('Email is invalid'),
    body('phoneNumber').isMobilePhone().withMessage('Phone number is invalid'),
    body('address').notEmpty().withMessage('Address is required'),
    body('dateOfBirth').notEmpty().withMessage('Date of birth is Invalid'),
    body('gender').notEmpty().withMessage('Gender is required'),
    body('anniversaryDate').optional().custom(value => typeof value === 'string').withMessage('Please provide anniversary date'),
    body('address.street').notEmpty().withMessage('Street address is required'),
    body('address.city').notEmpty().withMessage('City is required'),
    body('address.postalCode').notEmpty().withMessage('Postal code is required'),
    body('address.country').notEmpty().withMessage('Country is required'),
    body('address.state').notEmpty().withMessage('Province/State is required'),
    body('isChurchAdmin').optional().custom(value => typeof value === 'boolean').withMessage('Please provide admin role status'),
    body('isMarried').optional().custom(value => typeof value === 'boolean').withMessage('Please provide Marital status'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateChurch = () => [
    body('name').notEmpty().withMessage('Name is required'),
    body('createdBy').notEmpty().withMessage('Please provide affiliated user'),
    body('shortName').notEmpty().withMessage('short Name is required'),
    body('timeZone').notEmpty().withMessage('Time Zone is required'),
    body('emailAddress').isEmail().withMessage('Email is invalid'),
    body('phoneNumber').isMobilePhone().withMessage('Phone number is invalid'),
    body('address.street').notEmpty().withMessage('Address is required'),
    body('address.city').notEmpty().withMessage('City is required'),
    body('address.postalCode').notEmpty().withMessage('Postal code is required'),
    body('address.country').notEmpty().withMessage('Country is required'),
    body('address.state').notEmpty().withMessage('Province/State is required'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateEvent = () => [
    body('church').notEmpty().withMessage('Church is required'),
    body('createdBy').notEmpty().withMessage('Invalid user or permission'),
    body('title').notEmpty().withMessage('Title is required'),
    body('description').notEmpty().withMessage('Description is required'),
    body('startDate').isDate({format: 'YYYY-MM-DD'}).withMessage('Start Date must be date with YYYY-MM-DD format'),
    body('startTime').custom((value) => {
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) { throw new Error('Value must be time with HH:MM format');}
        return true;}).withMessage('Start time is invalid'),
    body('endDate').isDate({format: 'YYYY-MM-DD'}).withMessage('End Date must be date with YYYY-MM-DD format'),
    body('endTime').custom((value) => {
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) { throw new Error('Value must be time with HH:MM format');}
        return true;}).withMessage('End time is invalid'),
    body('reminder').optional().notEmpty().withMessage('Reminder cannot be empty'),
    body('recurrence.frequency').optional().notEmpty().withMessage('Reminder cannot be empty'),
    body('recurrence.interval').optional().isNumeric().withMessage('Interval cannot be empty'),
    body('recurrence.daysOfWeek').optional().isNumeric().withMessage('Invalid recurrence day'),
    body('recurrence.endRecurrence').optional().isDate().withMessage('Invalid recurrence end date'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateKid = () => [
    body('parent').notEmpty().withMessage('Please provide affiliated parent'),
    body('firstName').notEmpty().withMessage('First Name is required'),
    body('lastName').notEmpty().withMessage('Last Name is required'),
    body('dateOfBirth').notEmpty().withMessage('Date of birth is Invalid'),
    body('gender').notEmpty().withMessage('Gender is required'),
    body('middleName').optional().custom(value => value.length < 3).withMessage('Please provide a vallid middle name'),
    body('allergies').optional().custom(value => Array.isArray(value)).withMessage('Allergies must be array of string'),
    (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
        next();
    }
];  

const validateMinistry = () => [
    body('church').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid affiliated church ID'),
    body('leaderId').optional().custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid leader ID'),
    body('name').notEmpty().withMessage('Name is required'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateDevotion = () => [
    body('church').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid affiliated church ID'),
    body('author').optional().custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid author ID'),
    body('title').notEmpty().withMessage('Title is required'),
    body('scripture').notEmpty().withMessage('Scripture is required'),
    body('content').notEmpty().withMessage('Content is required'),
    body('date').notEmpty().withMessage('Devotion date is required'),
    body('tags').optional().notEmpty().withMessage('tags cannot be empty'),
    body('isPublished').optional().isBoolean().withMessage('isPublished must be boolean'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validatePrayer = () => [
    body('church').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid affiliated church ID'),
    body('author').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid author ID'),
    body('title').notEmpty().withMessage('Title is required'),
    body('anonymous').optional().isBoolean().withMessage('anonymous must be boolean'),
    body('isPublic').optional().isBoolean().withMessage('isPublic must be boolean'),
    body('prayerRequest').notEmpty().withMessage('prayerRequest is required'),
    body('urgency').optional().notEmpty().withMessage('urgency cannot be empty'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateTestimony = () => [
    body('church').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid affiliated church ID'),
    body('author').custom((value) => mongoose.Types.ObjectId.isValid(value)).withMessage('Please provide a valid author ID'),
    body('title').notEmpty().withMessage('Title is required'),
    body('anonymous').optional().isBoolean().withMessage('anonymous must be boolean'),
    body('isPublic').optional().isBoolean().withMessage('isPublic must be boolean'),
    body('story').notEmpty().withMessage('story is required'),
    body('impact').optional().notEmpty().withMessage('impact cannot be empty'),
    body('gratitude').optional().notEmpty().withMessage('gratitude cannot be empty'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateFellowship = () => [
    body('church').isMongoId().withMessage('Please provide affiliated church ID'),
    body('name').notEmpty().withMessage('Name is required'),
    body('address.street').notEmpty().withMessage('Address is required'),
    body('address.city').notEmpty().withMessage('City is required'),
    body('address.postalCode').notEmpty().withMessage('Postal code is required'),
    body('address.country').notEmpty().withMessage('Country is required'),
    body('address.state').notEmpty().withMessage('Province/State is required'),
    body('dayOfWeek').optional().notEmpty().withMessage('Location cannot be empty'),
    body('meetingTime').optional().notEmpty().withMessage('Location cannot be empty'),
    body('leaderId').optional().isMongoId().withMessage('Please provide a valid ID'),
    body('description').optional().notEmpty().withMessage('Description cannot be empty'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

const validateObjectId = () => [
    check('id').optional().isMongoId().withMessage('Invalid Object Id provided'),
    check('church').optional().isMongoId().withMessage('Invalid Object Id, provide valid church ID'),
    check('parent').optional().isMongoId().withMessage('Invalid Object Id, provide valid parent ID'),
    check('child').optional().isMongoId().withMessage('Invalid Object Id, provide valid child ID'),
];
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

module.exports = { validateChurch, validateUser, validateEvent, validateKid, validateObjectId, isValidObjectId, 
    validatePrayer, validateTestimony, validateDevotion ,validateMinistry, validateFellowship };
