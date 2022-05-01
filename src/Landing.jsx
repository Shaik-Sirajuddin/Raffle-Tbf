import React from 'react'
import './Landing.css'
import logo from './Images/text_logo.png';
import Wallet from './Wallet';
const Landing = () => {
    return (
        <>
            <div className="background">
                <div className=" bg-mountain">
                    <div className="kingdoms ">
                       
                        <div className="d-grid content ">
                        <Wallet/>
                        <div className="text-center">
                                <img className="img-fluid" src={logo} alt="" />
                            </div>
                        </div>

                    </div>
                </div>
            </div>s
        </>
    )
}

export default Landing