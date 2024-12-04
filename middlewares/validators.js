const { body, validationResult } = require('express-validator');
const Church = require('../models/Church');
const church = require("../models/Church");
const validateUser = () => [
    body('church').notEmpty().withMessage('Please provide affiliated church'),
    body('firstName').notEmpty().withMessage('First Name is required'),
    body('lastName').notEmpty().withMessage('Last Name is required'),
    body('emailAddress').isEmail().withMessage('Email is invalid'),
    body('phoneNumber').isMobilePhone().withMessage('Phone number is invalid'),
    body('address').notEmpty().withMessage('Address is required'),
    body('dateOfBirth').notEmpty().withMessage('Date of birth is Invalid'),
    body('gender').notEmpty().withMessage('Gender is required'),
    body('anniversaryDate').optional().isDate().withMessage('Please provide anniversary date'),
    body('address.street').notEmpty().withMessage('Street address is required'),
    body('address.city').notEmpty().withMessage('City is required'),
    body('address.postalCode').notEmpty().withMessage('Postal code is required'),
    body('address.country').notEmpty().withMessage('Country is required'),
    body('address.state').notEmpty().withMessage('Province/State is required'),
    body('isChurchAdmin').optional().isBoolean().withMessage('Please provide anniversary date'),
    body('isMarried').optional().isBoolean().withMessage('Please provide anniversary date'),
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
    body('shortName').notEmpty().withMessage('short Name is required'),
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
    body('churchId').notEmpty().withMessage('Church Id is required'),
    body('title').notEmpty().withMessage('Title is required'),
    body('startDate').isDate().withMessage('Start Date is invalid'),
    body('startTime').isTime().withMessage('Start time is invalid'),
    body('endDate').isDate().withMessage('End Date is invalid'),
    body('endTime').isTime().withMessage('End Time is invalid'),
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
module.exports = { validateChurch, validateUser, validateEvent };
