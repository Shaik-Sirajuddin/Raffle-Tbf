import { useEffect, useMemo, useState, useCallback } from 'react';
import * as anchor from '@project-serum/anchor';
import './Home.css'
import styled from 'styled-components';
import { Container, Snackbar } from '@material-ui/core';
import Paper from '@material-ui/core/Paper';
import Alert from '@material-ui/lab/Alert';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import { PublicKey, Transaction } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAnchorWallet } from '@solana/wallet-adapter-react';
import { WalletDialogButton } from '@solana/wallet-adapter-material-ui';
import {
  awaitTransactionSignatureConfirmation,
  CandyMachineAccount,
  CANDY_MACHINE_PROGRAM,
  createAccountsForMint,
  getCandyMachineState,
  getCollectionPDA,
  mintOneToken,
  SetupState,
} from './candy-machine';
import { AlertState, toDate, formatNumber, getAtaForMint } from './utils';
import { MintCountdown } from './MintCountdown';
import { MintButton } from './MintButton';
import { GatewayProvider } from '@civic/solana-gateway-react';
import { sendTransaction, sleep } from './connection';
import walletLogo from './Images/Solana_logo.png'
import { initializeApp } from 'firebase/app';
import { collection, doc, getDoc, getDocs, getFirestore, increment, setDoc, updateDoc } from "firebase/firestore";

const ConnectButton = styled(WalletDialogButton)`
  width: 100%;
  height: 60px;
  margin-top: 10px;
  margin-bottom: 5px;
  background: #ab5c2f;
  color: white;
  font-size: 16px;
  font-weight: bold;
`;

const MintContainer = styled.div``; // add your owns styles here

export interface HomeProps {
  candyMachineId?: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  txTimeout: number;
  rpcHost: string;
}

const Home = (props: HomeProps) => {
  const [isUserMinting, setIsUserMinting] = useState(false);
  const [candyMachine, setCandyMachine] = useState<CandyMachineAccount>();
  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: '',
    severity: undefined,
  });
  const [isActive, setIsActive] = useState(false);
  const [endDate, setEndDate] = useState<Date>();
  const [itemsRemaining, setItemsRemaining] = useState<number>();
  const [totalItemsRemaining,setTotalItemsRemaining] = useState<number>();
  const [isWhitelistUser, setIsWhitelistUser] = useState(false);
  const [isPresale, setIsPresale] = useState(false);
  const [discountPrice, setDiscountPrice] = useState<anchor.BN>();
  const [needTxnSplit, setNeedTxnSplit] = useState(true);
  const [setupTxn, setSetupTxn] = useState<SetupState>();
  const rpcUrl = props.rpcHost;
  const wallet = useWallet();
  const myAnchor = useAnchorWallet()
  var [isTbfPresale,setTbfPresale] = useState(false)
  var [isPublic,setIsPublic] = useState(true)
  
  const anchorWallet = useMemo(() => {
    if (
      !wallet ||
      !wallet.publicKey 
      ||
      !wallet.signAllTransactions ||
      !wallet.signTransaction
    ) {
      return;
    }

    return {
      publicKey: wallet.publicKey,
      signAllTransactions: wallet.signAllTransactions,
      signTransaction: wallet.signTransaction,
    } as anchor.Wallet;
  }, [wallet]);

  const firebaseConfig = {
    apiKey: "AIzaSyCriSTd7iLTestveOrqt2pKGnV2ewPdwcM",
    authDomain: "the-big-five-1333.firebaseapp.com",
    projectId: "the-big-five-1333",
    storageBucket: "the-big-five-1333.appspot.com",
    messagingSenderId: "541923477789",
    appId: "1:541923477789:web:8e719bb9098c0bfb3a39f4",
    measurementId: "G-R574Y9SV7T"
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
 
  
 
  const refreshCandyMachineState = useCallback(async () => {
    
    if (!anchorWallet) {
      return;
    }
    console.log("refreshing")
    if (props.candyMachineId) {
      try {
        const cndy = await getCandyMachineState(
          anchorWallet,
          props.candyMachineId,
          props.connection,
        );
        let active =
          cndy?.state.goLiveDate?.toNumber() < new Date().getTime() / 1000;
        let presale = false;
        // whitelist mint?
        if (cndy?.state.whitelistMintSettings) {
          // is it a presale mint?
          if (
            cndy.state.whitelistMintSettings.presale &&
            (!cndy.state.goLiveDate ||
              cndy.state.goLiveDate.toNumber() > new Date().getTime() / 1000)
          ) {
            presale = true;
          }
          // is there a discount?
          if (cndy.state.whitelistMintSettings.discountPrice) {
            setDiscountPrice(cndy.state.whitelistMintSettings.discountPrice);
          } else {
            setDiscountPrice(undefined);
            // when presale=false and discountPrice=null, mint is restricted
            // to whitelist users only
            if (!cndy.state.whitelistMintSettings.presale) {
              cndy.state.isWhitelistOnly = true;
            }
          }
          // retrieves the whitelist token
          const mint = new anchor.web3.PublicKey(
            cndy.state.whitelistMintSettings.mint,
          );
          const token = (await getAtaForMint(mint, anchorWallet.publicKey))[0];

          try {
            const balance = await props.connection.getTokenAccountBalance(
              token,
            );
            let valid = parseInt(balance.value.amount) > 0;
            // only whitelist the user if the balance > 0
            setIsWhitelistUser(valid);
            active = (presale && valid) || active;
          } catch (e) {
            setIsWhitelistUser(false);
            // no whitelist user, no mint
            if (cndy.state.isWhitelistOnly) {
              active = false;
            }
            console.log('There was a problem fetching whitelist token balance');
            console.log(e);
          }
        }
        // datetime to stop the mint?
        if (cndy?.state.endSettings?.endSettingType.date) {
          setEndDate(toDate(cndy.state.endSettings.number));
          if (
            cndy.state.endSettings.number.toNumber() <
            new Date().getTime() / 1000
          ) {
            active = false;
          }
        }

        setTotalItemsRemaining(1500-cndy.state.itemsRedeemed);
        console.log(cndy)
        let mintLimit = 1500
        // await getPresaleDetail()
   
        // amount to stop the mint?
        if (cndy?.state.endSettings?.endSettingType.amount) {
          var  limit = Math.min(
            cndy.state.endSettings.number.toNumber(),
            cndy.state.itemsAvailable,
          );
          limit = Math.min(
            limit,
            mintLimit
          )
          if (cndy.state.itemsRedeemed < limit) { 
            setItemsRemaining(limit - cndy.state.itemsRedeemed);
          } else {
            setItemsRemaining(0);
            cndy.state.isSoldOut = true;
          }
        } else if (mintLimit != 1333) {
          let limit = Math.min(
            mintLimit,
            cndy.state.itemsAvailable,
          );
          
          if (cndy.state.itemsRedeemed < limit) {
            setItemsRemaining(limit - cndy.state.itemsRedeemed);
          } else {
            setItemsRemaining(0);
            cndy.state.isSoldOut = true;
          }
        }
        else {
          setItemsRemaining(cndy.state.itemsRemaining);
        }

        if (cndy.state.isSoldOut) {
          active = false;
        }
       
        const [collectionPDA] = await getCollectionPDA(props.candyMachineId);
        const collectionPDAAccount =
          await cndy.program.provider.connection.getAccountInfo(collectionPDA);
          
        cndy.state.isActive = active
        cndy.state.isPresale = presale
        console.log(cndy.state.isActive)
        setIsActive(active);
        setIsPresale(presale);
        setCandyMachine(cndy);
        
        const txnEstimate =
          892 +
          (!!collectionPDAAccount && cndy.state.retainAuthority ? 182 : 0) +
          (cndy.state.tokenMint ? 177 : 0) +
          (cndy.state.whitelistMintSettings ? 33 : 0) +
          (cndy.state.whitelistMintSettings?.mode?.burnEveryTime ? 145 : 0) +
          (cndy.state.gatekeeper ? 33 : 0) +
          (cndy.state.gatekeeper?.expireOnUse ? 66 : 0);

        setNeedTxnSplit(txnEstimate > 1230);
      } catch (e) {
        console.log('There was a problem fetching Candy Machine state');
        console.log(e);
      }
    }
  }, [anchorWallet, props.candyMachineId, props.connection]);

  const onMint = async (
    beforeTransactions: Transaction[] = [],
    afterTransactions: Transaction[] = [],
  ) => {
    try {
      setIsUserMinting(true);
      document.getElementById('#identity')?.click();
      if (wallet.connected && candyMachine?.program && wallet.publicKey) {
        let setupMint: SetupState | undefined;
        if (needTxnSplit && setupTxn === undefined) {
          setAlertState({
            open: true,
            message: 'Please sign account setup transaction',
            severity: 'info',
          });
          setupMint = await createAccountsForMint(
            candyMachine,
            wallet.publicKey,
          );
          let status: any = { err: true };
          if (setupMint.transaction) {
            status = await awaitTransactionSignatureConfirmation(
              setupMint.transaction,
              props.txTimeout,
              props.connection,
              true,
            );
          }
          if (status && !status.err) {
            setSetupTxn(setupMint);
            setAlertState({
              open: true,
              message:
                'Setup transaction succeeded! Please sign minting transaction',
              severity: 'info',
            });
          } else {
            setAlertState({
              open: true,
              message: 'Mint failed! Please try again!',
              severity: 'error',
            });
            setIsUserMinting(false);
            return;
          }
        } else {
          setAlertState({
            open: true,
            message: 'Please sign minting transaction',
            severity: 'info',
          });
        }

        let mintOne = await mintOneToken(
          candyMachine,
          wallet.publicKey,
          beforeTransactions,
          afterTransactions,
          setupMint ?? setupTxn,
        );
        const mintTxId = mintOne[0];

        let status: any = { err: true };
        if (mintTxId) {
          status = await awaitTransactionSignatureConfirmation(
            mintTxId,
            props.txTimeout,
            props.connection,
            true,
          );
        }

        if (status && !status.err) {
          // manual update since the refresh might not detect
          // the change immediately
          let remaining = itemsRemaining! - 1;
          setItemsRemaining(remaining);
          setIsActive((candyMachine.state.isActive = remaining > 0));
          candyMachine.state.isSoldOut = remaining === 0;
          setSetupTxn(undefined);
          setAlertState({
            open: true,
            message: 'Congratulations! Mint succeeded!',
            severity: 'success',
          });
        } else {
          setAlertState({
            open: true,
            message: 'Mint failed! Please try again!',
            severity: 'error',
          });
        }
      }
    } catch (error: any) {
      let message = error.msg || 'Minting failed! Please try again!';
      if (!error.msg) {
        if (!error.message) {
          message = 'Transaction timeout! Please try again.';
        } else if (error.message.indexOf('0x137')) {
          console.log(error);
          message = `User rejected transaction`;
        } else if (error.message.indexOf('0x135')) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          console.log(error);
          message = `SOLD OUT!`;
          window.location.reload();
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: 'error',
      });
      // updates the candy machine state to reflect the latest
      // information on chain
      refreshCandyMachineState();
    } finally {
      setIsUserMinting(false);
    }
  };


  const toggleMintButton = () => {
    let active = !isActive || isPresale ;

    if (active) {
      if (candyMachine!.state.isWhitelistOnly && !isWhitelistUser) { 
        active = false;
      }
      if (endDate && Date.now() >= endDate.getTime()) {
        active = false;
      }
    }

    if (
      isPresale &&
      candyMachine!.state.goLiveDate &&
      candyMachine!.state.goLiveDate.toNumber() <= new Date().getTime() / 1000
    ) {
      setIsPresale((candyMachine!.state.isPresale = false));
    }

    setIsActive((candyMachine!.state.isActive = active));
  };
  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  // const loopUpdate = async () => {
  //   refreshCandyMachineState()
  //   console.log("done")
  //   await delay(10000)
  //    loopUpdate()
  // }


  useEffect(() => {
    refreshCandyMachineState();
  }, [
    anchorWallet,
    props.candyMachineId,
    props.connection,
    refreshCandyMachineState,
  ]);


  return (

    <Container className='bigBox' style={{ marginTop: 100 }}>
      <Container maxWidth="xs" style={{ position: 'relative', maxWidth: 600 }}>
        <Paper className='box'
          style={{
            padding: 24,
            paddingBottom: 10,
            backgroundColor: '#000000b3',
            borderRadius: 6
          }}
        >
          <h2 style={{ color: "#ffdc9e" }} className="t1 display- fw-bold text-center">{  "Raffle #1"}</h2> <br />
          
  
          <div className="d-flex mx-3 justify-content-evenly">
            <p className="ms-4 px-4  fw-bold py-2 walletAdd" style={{ marginLeft: 'auto', marginRight: 'auto', backgroundColor: "#ffac00", color: "#663d1d", borderRadius: 4 }}>
              Wallet Address :
            </p>
            <p className="px-4 py-2 fw-bold wallet" style={{ marginLeft: 'auto', marginRight: 'auto', backgroundColor: "#ffac00", color: "#663d1d", borderRadius: 4 }}>
              <img className="img-fluid me-3" style={{ width: "1.5rem" }} src={walletLogo} alt="" />
              {wallet.publicKey ? wallet.publicKey.toString() : '......'}
            </p>

          </div>
          {!wallet.connected ? (
            <ConnectButton className='connect'>Connect Wallet</ConnectButton>
          ) : (
            <>
              {candyMachine && (
                <Grid
                  container
                  direction="row"
                  justifyContent="center"
                  wrap="nowrap"
                >
                  <Grid item xs={3}>

                    <Typography
                      variant="h6"
                      color="textPrimary"
                      className='para'
                      style={{
                        fontWeight: 'bold',
                      }}
                    >
                      {`${totalItemsRemaining}`}
                    </Typography>
                    <Typography className='subTitle' variant="body2" color="textSecondary">
                      Remaining
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>

                    <Typography
                      variant="h6"
                      color="textPrimary"
                      className='para'
                      style={{ fontWeight: 'bold' }}
                    >
                      { "10 TBF" }
                      {/* <img src="./images/coin.png" alt="TBF" style={ 
                        {
                          width:"22px",
                          position:"relative",
                          bottom:"2px"

                        }
                      }/> */}
                    </Typography>
                    <Typography className='subTitle  dis' variant="body2" color="textSecondary">
                      {isWhitelistUser && discountPrice
                        ? 'Discount Price'
                        : 'Price'}
                    </Typography>
                  </Grid>
                  <Grid item xs={5} className='liveBox'>
                    { isTbfPresale && !isActive && endDate && Date.now() < endDate.getTime() ? (
                      <>

                        <MintCountdown
                          key="endSettings"
                          date={getCountdownDate(candyMachine)}
                          style={{ justifyContent: 'flex-end' }}
                          status="COMPLETED"
                          onComplete={toggleMintButton}
                        />
                        <Typography
                          className='endText'
                          variant="caption"
                          align="center"
                          display="block"
                          style={{ fontWeight: 'bold' }}
                        >
                          UNTIL WL
                        </Typography>
                      </>
                    ) : (
                      <>
                        <MintCountdown
                          key="goLive"
                          date={getCountdownDate(candyMachine)}
                          style={{ justifyContent: 'center' }}
                          status={
                            candyMachine?.state?.isSoldOut ||
                              (endDate && Date.now() > endDate.getTime())
                              ? 'COMPLETED'
                              : isPresale
                                ? 'LIVE'
                                : 'LIVE'
                          }
                          onComplete={toggleMintButton}
                        />
                        { !isTbfPresale && !isPublic &&
                          candyMachine.state.goLiveDate &&
                          candyMachine.state.goLiveDate.toNumber() >
                          new Date().getTime() / 1000 ?(
                            <Typography
                              variant="caption"
                              align="center"
                              display="block"
                              style={{ fontWeight: 'bold', marginTop:12 }}
                            >
                              UNTIL PUBLIC Raffle
                            </Typography>
                          ) :
                          <Typography
                              variant="caption"
                              align="center"
                              display="block"
                              style={{ fontWeight: 'bold', marginTop:12  }}
                            >
                              
                            </Typography>}
                      </>
                    )}
                  </Grid>
                </Grid>
              )}
              <MintContainer>
                {candyMachine?.state.isActive &&
                  candyMachine?.state.gatekeeper &&
                  wallet.publicKey &&
                  wallet.signTransaction ? (
                  <GatewayProvider
                    wallet={{
                      publicKey:
                        wallet.publicKey ||
                        new PublicKey(CANDY_MACHINE_PROGRAM),
                      //@ts-ignore
                      signTransaction: wallet.signTransaction,
                    }}
                    gatekeeperNetwork={
                      candyMachine?.state?.gatekeeper?.gatekeeperNetwork
                    }
                    clusterUrl={rpcUrl}
                    handleTransaction={async (transaction: Transaction) => {
                      setIsUserMinting(true);
                      const userMustSign = transaction.signatures.find(sig =>
                        sig.publicKey.equals(wallet.publicKey!),
                      );
                      if (userMustSign) {
                        setAlertState({
                          open: true,
                          message: 'Please sign one-time Civic Pass issuance',
                          severity: 'info',
                        });
                        try {
                          transaction = await wallet.signTransaction!(
                            transaction,
                          );
                        } catch (e) {
                          setAlertState({
                            open: true,
                            message: 'User cancelled signing',
                            severity: 'error',
                          });
                          // setTimeout(() => window.location.reload(), 2000);
                          setIsUserMinting(false);
                          throw e;
                        }
                      } else {
                        setAlertState({
                          open: true,
                          message: 'Refreshing Civic Pass',
                          severity: 'info',
                        });
                      }
                      try {
                        await sendTransaction(
                          props.connection,
                          wallet,
                          transaction,
                          [],
                          true,
                          'confirmed',
                        );
                        setAlertState({
                          open: true,
                          message: 'Please sign ticket',
                          severity: 'info',
                        });
                      } catch (e) {
                        setAlertState({
                          open: true,
                          message:
                            'Solana dropped the transaction, please try again',
                          severity: 'warning',
                        });
                        console.error(e);
                        // setTimeout(() => window.location.reload(), 2000);
                        setIsUserMinting(false);
                        throw e;
                      }
                      await onMint();
                    }}
                    broadcastTransaction={false}
                    options={{ autoShowModal: false }}
                  >
                    <MintButton
                      candyMachine={candyMachine}
                      isMinting={isUserMinting}
                      setIsMinting={val => setIsUserMinting(val)}
                      onMint={onMint}
                      isActive={ (isActive && itemsRemaining! > 0 ) || (isPresale && isWhitelistUser && itemsRemaining! > 0)}
                      rpcUrl={rpcUrl}
                      isTbfPresale={isTbfPresale}
                    />
                  </GatewayProvider>
                ) : (
                  <MintButton
                    candyMachine={candyMachine}
                    isMinting={isUserMinting}
                    setIsMinting={val => setIsUserMinting(val)}
                    onMint={onMint}
                    isActive={ ( isActive && itemsRemaining! > 0) || (isPresale && isWhitelistUser && itemsRemaining! > 0 )}
                    rpcUrl={rpcUrl}
                    isTbfPresale={isTbfPresale}
                  />
                )}
              </MintContainer>
            </>
          )}
          <Typography
            variant="caption"
            align="center"
            display="block"
            style={{ marginTop: 7, color: 'grey' }}
          >

          </Typography>
        </Paper>
      </Container>

      <Snackbar
        open={alertState.open}
        autoHideDuration={6000}
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
    </Container>
  );

};

const getCountdownDate = (
  candyMachine: CandyMachineAccount,
): Date | undefined => {
  if (
    candyMachine.state.isActive &&
    candyMachine.state.endSettings?.endSettingType.date
  ) {
    return toDate(candyMachine.state.endSettings.number);
  }

  return toDate(
    candyMachine.state.goLiveDate
      ? candyMachine.state.goLiveDate
      : candyMachine.state.isPresale
        ? new anchor.BN(new Date().getTime() / 1000)
        : undefined,
  );
};

export default Home; 
