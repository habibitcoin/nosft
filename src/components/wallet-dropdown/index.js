/* eslint-disable no-restricted-syntax, no-await-in-loop, no-continue */
import PropTypes from "prop-types";
import Image from "next/image";
import Anchor from "@ui/anchor";
import { toast } from "react-toastify";
import Button from "@ui/button";
import "react-toastify/dist/ReactToastify.css";
import { useState, useEffect } from "react";

const WalletDropdown = ({onConnect}) => {    
    return(
    <div className="rn-dropdown">
        <div className="rn-product-inner">
            <ul className="product-list">
                <li className="single-product-list">
                    <div className="content">
                        <Button color="primary-alta"
                        className="connectBtn"
                        size="small"
                        onClick={() => onConnect(false)}>
                        <Image 
                        width={25}
                        height={25}
                        src="https://raw.githubusercontent.com/getAlby/media/5065fa7184230ecd4d1f46357390a95d36c6939a/alby-sticker.svg"/>
                        Connect with Alby</Button>
                    </div>
                </li>
                <li className="single-product-list">
                    <div className="content">
                        <Button color="primary-alta"
                        className="connectBtn"
                        size="small"
                        onClick={() => onConnect('nosft.xyz')}>
                        <Image 
                        width={25}
                        height={25}
                        src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/MetaMask_Fox.svg/1200px-MetaMask_Fox.svg.png"/>
                        Connect with Metamask</Button>
                    </div>
                </li>
            </ul>
        </div>
    </div>)
};

WalletDropdown.propTypes = {
    onConnect: PropTypes.func.isRequired,
};

export default WalletDropdown;
